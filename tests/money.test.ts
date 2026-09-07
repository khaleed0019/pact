import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AmountError,
  addMinor,
  formatAmount,
  formatWithCurrency,
  fromMinor,
  minorToLunaNumber,
  splitByPercent,
  sumMinor,
  toMinor,
} from '../lib/pact/money.ts'
import { encodeBalanceOf, encodeTransfer } from '../lib/nimiq/evm.ts'
import { canTransition, isPayable, isTerminal, nextStatuses, STATUS_META } from '../lib/pact/state.ts'
import { PACT_STATUSES } from '../lib/pact/types.ts'

test('USDT uses six decimals, not eighteen', () => {
  assert.equal(toMinor('1', 'USDT'), '1000000')
  assert.equal(toMinor('200', 'USDT'), '200000000')
  assert.equal(toMinor('0.000001', 'USDT'), '1')
  assert.equal(toMinor('12.5', 'USDT'), '12500000')
})

test('NIM uses five decimals (Luna)', () => {
  assert.equal(toMinor('1', 'NIM'), '100000')
  assert.equal(toMinor('0.00001', 'NIM'), '1')
})

test('amounts round-trip exactly', () => {
  for (const value of ['1', '0.5', '200', '1234.56', '0.000001', '999999.999999']) {
    assert.equal(fromMinor(toMinor(value, 'USDT'), 'USDT'), value, `${value} must survive the round trip`)
  }
})

test('equivalent ways of writing the same amount normalise to one value', () => {
  // A user typing "10", "10.0" or "10.00" has agreed to the same number, and the terms
  // digest must not change depending on which one they typed.
  const canonical = toMinor('10', 'USDT')
  assert.equal(toMinor('10.0', 'USDT'), canonical)
  assert.equal(toMinor('10.00', 'USDT'), canonical)
  assert.equal(toMinor('010', 'USDT'), canonical)
  assert.equal(fromMinor(canonical, 'USDT'), '10')
})

test('too many decimal places are refused rather than silently truncated', () => {
  assert.throws(() => toMinor('1.9999999', 'USDT'), AmountError)
  assert.throws(() => toMinor('1.999999', 'NIM'), AmountError)
})

test('junk input is refused', () => {
  for (const bad of ['', '   ', 'abc', '1.2.3', '-5', '1e5', '0', '0.00']) {
    assert.throws(() => toMinor(bad, 'USDT'), AmountError, `"${bad}" must be rejected`)
  }
})

test('thousands separators in input are tolerated', () => {
  assert.equal(toMinor('1,234.50', 'USDT'), '1234500000')
})

test('display formatting groups thousands and trims trailing zeros', () => {
  assert.equal(formatAmount('1234500000', 'USDT'), '1,234.5')
  assert.equal(formatAmount('200000000', 'USDT'), '200')
  assert.equal(formatWithCurrency('150000000', 'USDT'), '150 USDT')
})

test('milestone splits always add back up to the total', () => {
  // 25/50/25 of an amount that does not divide evenly is the classic place to lose a unit.
  for (const total of ['100000000', '3', '7', '999999999', '150000000']) {
    for (const percents of [[25, 50, 25], [33.33, 33.33, 33.34], [50, 50], [100], [10, 20, 30, 40]]) {
      const parts = splitByPercent(total, percents)
      assert.equal(sumMinor(parts), total, `${percents} of ${total} must sum back to the total`)
      assert.equal(parts.length, percents.length)
    }
  }
})

test('big amounts use exact integer maths', () => {
  assert.equal(addMinor('9007199254740993', '1'), '9007199254740994') // beyond float precision
  assert.equal(sumMinor(['1', '2', '3']), '6')
})

test('Luna conversion refuses amounts that would lose precision as a JS number', () => {
  assert.equal(minorToLunaNumber('100000'), 100000)
  assert.throws(() => minorToLunaNumber('99007199254740993000'), AmountError)
})

// --- ERC-20 encoding ---------------------------------------------------------------

test('a USDT transfer encodes to the standard selector and padded arguments', () => {
  const recipient = '0x1234567890abcdef1234567890abcdef12345678'
  const data = encodeTransfer(recipient, '200000000')

  assert.equal(data.slice(0, 10), '0xa9059cbb', 'transfer(address,uint256) selector')
  assert.equal(data.length, 10 + 64 + 64, 'selector plus exactly two 32-byte words')
  assert.equal(data.slice(10, 74), '0'.repeat(24) + recipient.slice(2), 'address left-padded to 32 bytes')
  assert.equal(BigInt(`0x${data.slice(74)}`).toString(), '200000000', 'amount survives encoding')
})

test('a malformed recipient is rejected before it can reach a wallet', () => {
  assert.throws(() => encodeTransfer('0x123', '1'))
  assert.throws(() => encodeTransfer('NQ07 0000 0000', '1'), 'a Nimiq address is not an EVM address')
})

test('balanceOf encodes to the standard selector', () => {
  const data = encodeBalanceOf('0x1234567890abcdef1234567890abcdef12345678')
  assert.equal(data.slice(0, 10), '0x70a08231')
  assert.equal(data.length, 10 + 64)
})

// --- state machine ------------------------------------------------------------------

test('the lifecycle allows exactly the intended moves', () => {
  assert.equal(canTransition('DRAFT', 'PENDING', 'CLIENT'), true)
  assert.equal(canTransition('PENDING', 'ACTIVE', 'PROVIDER'), true)
  assert.equal(canTransition('ACTIVE', 'IN_PROGRESS', 'PROVIDER'), true)
  assert.equal(canTransition('DELIVERED', 'COMPLETED', 'CLIENT'), true)
})

test('a provider cannot approve their own delivery', () => {
  assert.equal(canTransition('DELIVERED', 'COMPLETED', 'PROVIDER'), false)
  assert.equal(canTransition('ACTIVE', 'IN_PROGRESS', 'CLIENT'), false, 'only the provider starts work')
})

test('terminal states are terminal', () => {
  for (const status of ['COMPLETED', 'DECLINED', 'CANCELLED'] as const) {
    assert.equal(isTerminal(status), true)
    assert.deepEqual(nextStatuses(status, 'CLIENT'), [])
    assert.deepEqual(nextStatuses(status, 'PROVIDER'), [])
  }
})

test('skipping the lifecycle is impossible', () => {
  assert.equal(canTransition('DRAFT', 'COMPLETED', 'CLIENT'), false)
  assert.equal(canTransition('PENDING', 'DELIVERED', 'PROVIDER'), false)
  assert.equal(canTransition('COMPLETED', 'ACTIVE', 'CLIENT'), false)
})

test('money is only expected to move in states where work is underway', () => {
  assert.equal(isPayable('ACTIVE'), true)
  assert.equal(isPayable('IN_PROGRESS'), true)
  assert.equal(isPayable('DRAFT'), false)
  assert.equal(isPayable('PENDING'), false)
})

test('every status has display metadata', () => {
  for (const status of PACT_STATUSES) {
    assert.ok(STATUS_META[status], `${status} needs a label`)
    assert.ok(STATUS_META[status].label.length > 0)
    assert.ok(STATUS_META[status].blurb.length > 0)
  }
})

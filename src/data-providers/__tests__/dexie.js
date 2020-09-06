import { store } from '../../store'
import { ROOT_TOKEN } from '../../constants'
import { initialize } from '../../initialize'
import { getChildren, getThought } from '../../selectors'
import initDB, * as db from '../dexie'
import dataProviderTest from '../../test-helpers/dataProviderTest'

jest.useFakeTimers()

// mock debounce to use 0 delay
jest.mock('lodash', () => ({
  ...jest.requireActual('lodash'),

  // jest.mock must be inline
  // possible workarounds:
  // - use global
  // - https://stackoverflow.com/questions/40465047/how-can-i-mock-an-es6-module-import-using-jest
  debounce: jest.fn().mockImplementation((fn, delay) => {
    let timer = null // eslint-disable-line fp/no-let
    let pendingArgs = null // eslint-disable-line fp/no-let

    const cancel = jest.fn(() => {
      if (timer) {
        clearTimeout(timer)
      }
      timer = null
      pendingArgs = null
    })

    const flush = jest.fn(() => {
      if (timer) {
        fn(...pendingArgs)
        cancel()
      }
    })

    // eslint-disable-next-line jsdoc/require-jsdoc
    const wrapped = (...args) => {
      cancel()

      pendingArgs = args

      // TODO: why doesn't jest.runOnlyPendingTimers work here?
      // use 0 instead of given delay as a workaround
      timer = setTimeout(flush, 0)
    }

    wrapped.cancel = cancel
    wrapped.flush = flush
    wrapped.delay = delay

    return wrapped
  }),
}))

describe('dexie', () => {

  beforeEach(initDB)
  afterEach(db.clearAll)
  dataProviderTest(db)

})

describe('integration', () => {

  beforeEach(async () => {
    await initialize()

    // fake timers cause an infinite loop on _.debounce
    // Jest v26 contains a 'modern' option for useFakeTimers (https://github.com/facebook/jest/pull/7776), but I am getting a "TypeError: Cannot read property 'useFakeTimers' of undefined" error when I call jest.useFakeTimers('modern'). The same error does not uccor when I use 'legacy' or omit the argument (react-scripts v4.0.0-next.64).
    // https://github.com/facebook/jest/issues/3465#issuecomment-504908570
    jest.runOnlyPendingTimers()
  })

  afterEach(async () => {
    store.dispatch({ type: 'clear' })
    await db.clearAll()
    jest.runOnlyPendingTimers()
  })

  it('load settings into indexedDB on initialization', async () => {
    const thoughtState = getThought(store.getState(), 'Settings')

    expect(thoughtState).not.toBeUndefined()
    expect(thoughtState.contexts).toHaveLength(1)

    // TODO: Tests fail without a dummy call to the database. Why?
    await db.getHelpers()

    const thoughtDB = await db.getThought('Settings')

    expect(thoughtDB).not.toBeUndefined()
    expect(thoughtDB.contexts).toHaveLength(1)

    expect(thoughtState.contexts[0].id).toEqual(thoughtDB.contexts[0].id)
  })

  it('persist newThought', async () => {

    store.dispatch({ type: 'newThought', value: 'a' })

    jest.runOnlyPendingTimers()

    const parentEntryRoot = await db.getContext([ROOT_TOKEN])

    expect(parentEntryRoot).toMatchObject({
      children: [{ value: 'a', rank: 0 }]
    })
  })

  it('persist existingThoughtChange', async () => {

    store.dispatch([
      { type: 'newThought', value: '' },
      {
        type: 'existingThoughtChange',
        context: [ROOT_TOKEN],
        oldValue: '',
        newValue: 'a',
        thoughtsRanked: [{ value: '', rank: 0 }]
      }
    ])

    jest.runOnlyPendingTimers()

    const parentEntryRoot = await db.getContext([ROOT_TOKEN])

    expect(parentEntryRoot).toMatchObject({
      children: [{ value: 'a', rank: 0 }]
    })

    await initialize()
    jest.runOnlyPendingTimers()
  })

  it('load thought', async () => {

    const parentEntryRoot1 = await db.getContext([ROOT_TOKEN])
    jest.runOnlyPendingTimers()
    expect(parentEntryRoot1).toBeUndefined()

    // create a thought, which will get persisted to local db
    store.dispatch({ type: 'newThought', value: 'a' })
    jest.runOnlyPendingTimers()

    const parentEntryRoot = await db.getContext([ROOT_TOKEN])
    jest.runOnlyPendingTimers()
    expect(parentEntryRoot).toMatchObject({
      children: [{ value: 'a', rank: 0 }]
    })

    // clear state
    store.dispatch({ type: 'clear' })
    jest.runOnlyPendingTimers()

    const children = getChildren(store.getState(), [ROOT_TOKEN])
    expect(children).toHaveLength(0)

    // confirm thought is still in local db after state has been cleared
    const parentEntryRootAfterReload = await db.getContext([ROOT_TOKEN])
    jest.runOnlyPendingTimers()
    expect(parentEntryRootAfterReload).toMatchObject({
      children: [{ value: 'a', rank: 0 }]
    })

    // call initialize again to reload from db (simulating page refresh)
    await initialize()
    jest.runOnlyPendingTimers()

    const childrenAfterInitialize = getChildren(store.getState(), [ROOT_TOKEN])
    expect(childrenAfterInitialize).toMatchObject([
      { value: 'a', rank: 0 }
    ])
  })

  // TODO: Not passing as expected. Unknown timing issues.
  it.skip('load buffered thoughts', async () => {

    // a, b, c, d, e, ...
    // create a number of descendants equal to double the buffer depth to test loading multiple levels
    // const values = new Array(THOUGHT_BUFFER_DEPTH * 2 + 1).fill(null).map((_, i) => String.fromCharCode(i + 97))
    const values = 'abcde'.split('')
    store.dispatch(values.map(value => ({ type: 'newSubthought', value })))
    jest.runOnlyPendingTimers()

    expect(await db.getContext([ROOT_TOKEN])).toMatchObject({ children: [{ value: 'a', rank: 0 }] })
    expect(await db.getContext(['a'])).toMatchObject({ children: [{ value: 'b', rank: 0 }] })
    expect(await db.getContext(['a', 'b'])).toMatchObject({ children: [{ value: 'c', rank: 0 }] })
    expect(await db.getContext(['a', 'b', 'c'])).toMatchObject({ children: [{ value: 'd', rank: 0 }] })
    expect(await db.getContext(['a', 'b', 'c', 'd'])).toMatchObject({ children: [{ value: 'e', rank: 0 }] })

    // clear state
    store.dispatch({ type: 'clear' })
    jest.runOnlyPendingTimers()

    // call initialize again to reload from db (simulating page refresh)
    await initialize()
    jest.runOnlyPendingTimers()

    const state = store.getState()
    expect(getChildren(state, [ROOT_TOKEN])).toMatchObject([{ value: 'a', rank: 0 }])
    expect(getChildren(state, ['a'])).toMatchObject([{ value: 'b', rank: 0 }])
    expect(getChildren(state, ['a', 'b'])).toMatchObject([{ value: 'c', rank: 0 }])
    expect(getChildren(state, ['a', 'b', 'c'])).toMatchObject([{ value: 'd', rank: 0 }])
    expect(getChildren(state, ['a', 'b', 'c', 'd'])).toMatchObject([{ value: 'e', rank: 0 }])
  })

})

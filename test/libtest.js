import { forEach, isArray } from 'substance'

const add = {
  type: 'function',
  name: 'add',
  methods: {
    default: {
      params: [
        { name: 'value', type: 'number' },
        { name: 'other', type: 'number' }
      ]
    }
  },
  body: function (value, other) {
    return value + other
  }
}

const multiply = {
  type: 'function',
  name: 'multiply',
  methods: {
    default: {
      params: [
        { name: 'value', type: 'number' },
        { name: 'other', type: 'number' }
      ]
    }
  },
  body: function (value, other) {
    return value * other
  }
}

function sum (...vals) {
  return vals.reduce((a, b) => {
    if (b.type === 'table') {
      forEach(b.data, (vals) => {
        a += sum(vals)
      })
      return a
    } else if (isArray(b)) {
      return sum(...b)
    } else if (isArray(b.data)) {
      return sum(...b.data)
    } else {
      return a + b
    }
  }, 0)
}

const sum_ = {
  type: 'function',
  name: 'sum',
  methods: {
    default: {
      params: [
        { name: 'val', type: 'number', 'repeats': true }
      ]
    }
  },
  body: sum
}

let RAND_COUNT = 1
const rand = {
  type: 'function',
  name: 'rand',
  methods: {
    default: {}
  },
  body: function () {
    // very pseudo random
    return RAND_COUNT++
  }
}

// used in tests to reset the pseudo random generator
export function _resetRand () {
  RAND_COUNT = 1
}

const noParams = {
  type: 'function',
  name: 'no_params',
  methods: {
    default: {}
  },
  body: function () {
    return 5
  }
}

const oneParam = {
  type: 'function',
  name: 'one_param',
  methods: {
    default: {
      params: [
        { name: 'param1', type: 'number' }
      ]
    }
  },
  body: function (param1) {
    return param1 * 1.1
  }
}

const oneParamWithDefault = {
  type: 'function',
  name: 'one_param_with_default',
  methods: {
    default: {
      params: [
        {
          name: 'param1',
          type: 'string',
          default: { type: 'string', value: 'Hello!' }
        }
      ]
    }
  },
  body: function (param1 = 'Hello!') {
    return param1
  }
}

export const libtest = {
  type: 'library',
  name: 'test',
  funcs: {
    add,
    sum: sum_,
    multiply,
    rand,
    noParams,
    oneParam,
    oneParamWithDefault
  }
}

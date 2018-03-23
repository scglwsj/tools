function validatePersonID(id, backInfo = true) {
  const info = {
    year: 1900,
    month: 1,
    day: 1,
    sex: 'Male',
    valid: false,
    length: 0
  };
  const initDate = (length) => {
    info.length = length;
    const a = length === 15 ? 0 : 2;  // 15:18
    info.year = parseInt((a ? '' : '19') + id.substring(6, 8 + a), 10);
    info.month = parseInt(id.substring(8 + a, 10 + a), 10) - 1;
    info.day = parseInt(id.substring(10 + a, 12 + a), 10);
    info.sex = id.substring(14, 15 + a) % 2 === 0 ? 'Female' : 'Male';

    const myDate = new Date();
    const temp = new Date(info.year, info.month, info.day);
    info.age = myDate.getFullYear() - temp.getFullYear();
    if ((temp.getMonth() > myDate.getMonth()) || ((temp.getMonth() === myDate.getDay())) && temp.getMonth() > myDate.getDay()) {
      info.age -= 1;
    }

    return (temp.getFullYear() === info.year)
      && (temp.getMonth() === info.month)
      && (temp.getDate() === info.day);
  };
  const back = () => {
    return backInfo ? info : info.valid;
  };
  if (typeof id !== 'string') return back();
  // 18
  if (/^\d{17}[0-9x]$/i.test(id)) {
    if (!initDate(18)) return back();
    id = id.toLowerCase().split('');
    const wi = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    const y = '10x98765432'.split('');
    let sum = 0;
    for (let i = 0; i < 17; i++) sum += wi[i] * id[i];
    if (y[sum % 11] === id.pop().toLowerCase()) info.valid = true;
    return back();
  } else if (/^\d{15}$/.test(id)) {
    // 15位
    if (initDate(15)) info.valid = true;
    return back();
  } else {
    return back();
  }
}

async function filterJudge(result, key, superKey, keyString, value) {
  if (result) {
    return value === undefined ? { key: superKey } : { object: { [key]: value }, key: superKey };
  } else {
    throw { msg: `参数${keyString}验证失败！` };
  }
}

function arrayEnumFilterCreator(enums) {
  const enumFilter = enumFilterCreator(enums);
  return values => Array.isArray(values) && values.every(enumFilter);
}

function enumFilterCreator(enums) {
  return value => enums && enums.includes(value);
}

async function argsFilter(args = {}, rules, superKey, keyString) {
  const deleteKeys = [];
  const filterStr = {
    always: () => true,  // 我不care它！ ——Chloric
    empty: () => false,
    required: value => typeof value !== 'undefined',
    array: Array.isArray,
    int: Number.isInteger,
    string: value => typeof value === 'string',
    bool: value => typeof value === 'boolean',
    personID: value => validatePersonID(value, false),
    phone(value) {
      const phone = value.toString();
      return phone[0] === '1' && phone.length === 11;
    },
    // id: mongoose.Types.ObjectId.isValid,  // 坑！
    id: value => value.toString().match(/^[0-9a-fA-F]{24}$/),
    undefined() {
      throw { msg: '未知的验证规则！' };
    }
  };

  const argsChange = {
    boolStr: {
      rule: 'bool',
      change(arg) {
        if (arg === 'true') {
          return true;
        } else if (arg === 'false') {
          return false;
        } else {
          return arg;
        }
      }
    },
    intStr: {
      rule: 'int',
      change: parseInt
    }
  };

  const filterType = {
    string: (rule, value, key, keyString, superKey) => filterJudge((filterStr[rule] || filterStr.undefined)(value), key, superKey, keyString, value),
    async object(rule, value, key, keyString, superKey) {
      const argsObj = value === null ? { object: { [key]: value } } : await argsFilter(value, rule, key, keyString);
      argsObj.key = superKey;
      return argsObj;
    },
    function: (rule, value, key, keyString, superKey) => filterJudge(rule(value), key, superKey, keyString, value)
  };

  const results = await Promise.all(Object.keys(rules).map(key => {
    const superKeyStr = `${keyString ? `${keyString}.` : ''}${key}`;
    let kRules = rules[key];
    if (typeof args[key] === 'undefined') {
      if (typeof kRules === 'object') {
        args[key] = {};
        deleteKeys.push(key);
      } else if (kRules !== 'required' || (Array.isArray(kRules) && !kRules.includes('required'))) {
        kRules = 'always';
      }
    }

    if (argsChange[kRules]) {
      const { rule, change } = argsChange[kRules];
      kRules = rule;
      args[key] = change(args[key]);
    } else if (Array.isArray(kRules)) {
      for (const changeRule of kRules) {
        if (argsChange[changeRule]) {
          const { rule, change } = argsChange[changeRule];
          kRules = kRules.filter(rule =>
            rule !== changeRule
          );
          kRules.push(rule);
          args[key] = change(args[key]);
          break;
        }
      }
    }

    return Array.isArray(kRules) ?
      Promise.all(kRules.map(rule => filterType[typeof rule](rule, args[key], key, superKeyStr, superKey))) :
      filterType[typeof kRules](kRules, args[key], key, superKeyStr, superKey);
  }));

  let key;
  const result = results.map(result => {
    if (Array.isArray(result)) {
      result.forEach(resultItem =>
        key = key || resultItem.key
      );
    } else {
      key = key || result.key;
    }
    return result;
  }).filter(result =>
    Array.isArray(result) ? result.length > 0 : typeof result.object !== 'undefined'
  ).map(result =>
    Array.isArray(result) ? result[0] : result
  ).reduce((resultObject, { object }) => ({ ...resultObject, ...object }), {});
  deleteKeys.forEach(deleteKey => delete result[deleteKey]);
  return key ? { object: { [key]: result } } : result;
}

module.exports = { filterJudge, arrayEnumFilterCreator, enumFilterCreator, argsFilter };

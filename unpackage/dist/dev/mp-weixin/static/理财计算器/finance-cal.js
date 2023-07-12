function PMT() {}

PMT.prototype.pmt = function (rate, nper, pv, fv, type) {
  if (!fv) fv = 0;
  if (!type) type = 0;

  if (rate == 0) return -(pv + fv) / nper;

  var pow = Math.pow(1 + rate, nper);
  var pmt = (rate / (pow - 1)) * -(pv * pow + fv);

  if (type == 1) {
    pmt /= 1 + rate;
  }

  return pmt.toFixed(4);
};

PMT.prototype.nper = function nper(rate, pv, fv, pmt, type) {
  if (!fv) fv = 0;
  if (!type) type = 0;

  if (rate == 0) return -(pv + fv) / pmt;

  if (type === 1) {
    pmt = (1 + rate) * pmt;
  }

  var nper = Math.log((pmt - rate * fv) / (pmt + rate * pv)) / Math.log(1 + rate);
  // 计算器中如需求"期数"的，其计算结果向上取整。例如，如计算结果为10.0001（年），10.5（年）,10.95（年）等情况的，都近似为11（年）。
  return Math.ceil(nper);
};

PMT.prototype.pv = function pv(rate, nper, fv, pmt, type) {
  if (!fv) fv = 0;
  if (!type) type = 0;

  if (rate === 0) return -pmt * nper - fv;

  if (type === 1) {
    pmt = (1 + rate) * pmt;
  }

  var pow = Math.pow(1 + rate, nper);
  var pv = ((-pmt * (pow - 1)) / rate - fv) / pow;
  return pv.toFixed(4);
};

PMT.prototype.fv = function fv(rate, nper, pv, pmt, type) {
  if (!type) type = 0;

  if (rate === 0) return -pmt * nper - pv;

  if (type === 1) {
    pmt = (1 + rate) * pmt;
  }

  var pow = Math.pow(1 + rate, nper);
  var fv = (-pmt * (pow - 1)) / rate - pv * pow;
  return fv.toFixed(4);
};

var query = function (selector) {
  return document.querySelector(selector);
};
var queryAll = function (selector) {
  return document.querySelectorAll(selector);
};

function disableParam() {
  query('[name="param"]:not(:checked)').disabled = true;
}

function setInputFilter(textbox, inputFilter) {
  ["input", "keydown", "keyup", "mousedown", "mouseup", "select", "contextmenu", "drop"].forEach(function (event) {
    textbox.addEventListener(event, function () {
      if (inputFilter(this.value)) {
        this.oldValue = this.value;
        this.oldSelectionStart = this.selectionStart;
        this.oldSelectionEnd = this.selectionEnd;
      } else if (this.hasOwnProperty("oldValue")) {
        this.value = this.oldValue;
        this.setSelectionRange(this.oldSelectionStart, this.oldSelectionEnd);
      } else {
        this.value = "";
      }
    });
  });
}

var pmtCalculator = new PMT();
var params = ["nper", "pv", "fv", "pmt"];
var todo = [];

function calculate() {
  var checkedParams = queryAll('[name="param"]:checked');
  if (checkedParams.length !== 3) return;

  var typeElem = query('[name="type"]:checked');
  if (!typeElem) return;

  var rate = Number(query('[name="rate"]').value) / 100;
  var type = Number(typeElem.value);
  var paramsKey = [],
    paramsValue = [];

  /*checkedParams.forEach(function (element) {
    paramsKey.push(element.value);
    paramsValue.push(Number(query(`[name="${element.value}"]`).value));
  });*/

  let hasEmptyParam = false;
  checkedParams.forEach(function (element) {
    const elementDom = query(`[name="${element.value}"]`);
    elementDom.classList.remove("invalid-tip");
    const pVal = elementDom.value;
    // 如果没有输入数值，给出提示
    if (pVal === "") {
      hasEmptyParam = true;
      elementDom.classList.add("invalid-tip");
    }

    // 如果利率没有填写
    const rateDom = query('[name="rate"]');
    if (rateDom.value === "") {
      hasEmptyParam = true;
      rateDom.classList.add("invalid-tip");
    }

    paramsKey.push(element.value);
    paramsValue.push(Number(pVal));
  });

  if (hasEmptyParam) {
    return;
  }

  for (var i = 0; i < params.length; i++) {
    var param = params[i];
    // 确定计算项
    if (paramsKey.indexOf(params[i]) === -1) {
      var result = pmtCalculator[param](rate, paramsValue[0], paramsValue[1], paramsValue[2], type);
      // var result = pmtCalculator[param](...[rate, ...paramsValue, type]);

      query(".result").innerHTML = result;
      query(".result").style.color = "#333";
      break;
    }
  }
}

function clearResult() {
  window.location.reload();
  /*var inputParams = queryAll('input.input-param');
  for(let i = 0, len = inputParams.length; i < len; i++) {
    inputParams[i].value = '';
  }
  */
}

window.onload = function () {
  document.getElementById("calculate").addEventListener("click", calculate);
  document.getElementById("clear-result").addEventListener("click", clearResult);

  // input-paramt focus remove invalid tip
  var inputParams = queryAll("input.input-param");
  var params = queryAll("input[name=param]");

  for (let i = 0, len = params.length; i < len; i++) {
    params[i].addEventListener("click", function () {
      const inputPara = document.querySelector("input.input-param[name=" + params[i].id + "]");
      inputPara.classList.remove("invalid-tip");
    });
  }
  for (let i = 0, len = inputParams.length; i < len; i++) {
    const inputEle = inputParams[i];
    inputEle.addEventListener("focus", function () {
      inputEle.classList.remove("invalid-tip");
    });
    inputEle.nextElementSibling.addEventListener("click", function () {
      inputEle.classList.remove("invalid-tip");
    });
  }

  // 设置输入输出项
  // 期数、现值、终值、每期付款额, 可勾选其中任意三项值
  Array.prototype.forEach.call(queryAll('[name="param"]'), function (ele) {
    ele.addEventListener("click", function (e) {
      var checkedParam = this.value;
      var input = query(`[name="${checkedParam}"`);
      if (this.checked) {
        todo.push(checkedParam);
        input.disabled = false;

        if (todo.length === 3) {
          query('[name="param"]:not(:checked)').disabled = true;
        }
      } else {
        var index = todo.indexOf(checkedParam);
        todo.splice(index, 1);
        input.disabled = true;
        input.value = "";

        if (todo.length === 2) {
          query('[name="param"]:disabled').disabled = false;
          query(".result").style.color = "#9e9e9e";
        }
      }
    });
  });

  // input filters
  Array.prototype.forEach.call(queryAll(".input-param"), function (ele) {
    setInputFilter(ele, function (value) {
      return /^-?\d*\.?\d*$/.test(value); // Allow digits and '.' only, using a RegExp
    });

    ele.addEventListener("blur", function () {
      if ([".", "-", "-."].indexOf(this.value) > -1) {
        this.value = "";
      }
    });
  });

  // input calculator
  const closeBtns = document.querySelectorAll(".close");
  for (let i = 0, len = closeBtns.length; i < len; i++) {
    const closeBtn = closeBtns[i];
    closeBtn.removeEventListener("click", __postMsg);
    closeBtn.addEventListener("click", __postMsg);
  }
  function __postMsg() {
    window.parent.postMessage("close", "*");
  }

  // TODO: sqrt, %, 1/x, +/-
  // 4+5+sqrt
  // 4+5+/-
  (function () {
    "use strict";
    // result
    var result;
    // current number
    var currNum;
    // prev result
    var prevResult;
    // history
    var history;
    // prev btn pressed
    var prevBtn;
    // math operation
    var mathOp;
    // prev math operation
    var prevMathOp;
    // math operation counter
    var mathOpCount;
    // math op pressed?
    var mathOpPress;
    // init
    var isInit;
    // main screen
    var mainScreen;
    // history screen
    var historyScreen = document.querySelector("#history");

    // 显示小键盘
    var subCalc = query(".sub-calc");
    Array.prototype.forEach.call(queryAll(".mini-calc"), function (ele) {
      ele.addEventListener("click", function (e) {
        e.stopPropagation();
        if (ele.previousElementSibling.disabled) return;

        mainScreen = ele.previousElementSibling;

        init({
          currNum: mainScreen.value,
          prevBtn: mainScreen.value,
          history: mainScreen.value === "0" ? "" : mainScreen.value,
        });

        subCalc.style.display = "inline-block";
        subCalc.style.position = "absolute";
        subCalc.style.left = ele.offsetLeft - subCalc.offsetWidth + "px";
        subCalc.style.top = ele.offsetTop + 20 + "px";
        mainScreen.classList.add("focused");
      });
    });

    query(".pmt-calculator").addEventListener("click", function (e) {
      subCalc.style.display = "none";
      Array.prototype.forEach.call(queryAll(".input-param"), function (ele) {
        ele.classList.remove("focused");
      });
    });

    query(".sub-calc").addEventListener("click", function (e) {
      e.stopPropagation();
    });

    // attach click events to buttons
    Array.prototype.forEach.call(subCalc.querySelectorAll(".button"), function (btn) {
      btn.addEventListener("click", function (e) {
        var btnClicked = e.currentTarget.getAttribute("data-value");
        input(btnClicked);
      });
    });

    // initialize
    function init(param) {
      result = null;
      currNum = param.currNum;
      prevBtn = param.prevBtn;
      mathOp = null;
      prevMathOp = null;
      mathOpCount = 0;
      history = param.history;
      mathOpPress = false;
      isInit = true;
      // updateMainScreen(0);
      // updateHistoryScreen(history);
    }

    function input(btn) {
      // copy prev math op
      if (!isNaN(prevBtn) && btn !== "=" && btn !== "C" && btn !== "CS" && btn !== ".") {
        prevMathOp = mathOp;
      }

      switch (btn) {
        case "+":
          mathOpPress = true;
          mathOp = addition;
          break;
        case "-":
          mathOpPress = true;
          mathOp = subtraction;
          break;
        case "/":
          mathOpPress = true;
          mathOp = division;
          break;
        case "*":
          mathOpPress = true;
          mathOp = multiplication;
          break;
        case "C":
          init({
            currNum: "0",
            prevBtn: null,
            history: "",
          });
          updateMainScreen(0);
          break;
      }

      handler(btn);

      // console.log("Result: " + result);
      // console.log("Prev result: " + prevResult);
      // console.log("current number: " + currNum);
      // console.log("btn: " + btn);
      // console.log("Prev Math Op: " + prevMathOp);
      // console.log('Math Op: ' + mathOp);
      // console.log("Math Op Counter: " + mathOpCount);
      // console.log("Prev btn: " + prevBtn);
      // console.log("History: " + history);
      // console.log("Main Screen " + mainScreen.value);
      // console.log('Math Op Press: ' + mathOpPress);
      // console.log("*".repeat(15));
    }

    // mathOpPress = true;
    // mathOp = addition;
    // 4 + 5 +
    function handler(btn) {
      // return if C wasn't pressed when divide by zero was done
      if ((btn !== "C" && result === "Result is undefined") || result === "Cannot divide by zero") {
        return;
      }

      // update history
      if (btn !== "=" && btn !== "C" && btn !== "CS") {
        history = isNaN(prevBtn) && isNaN(btn) ? history.slice(0, -1) + btn : history + btn;
      }

      // btn clicked is `Number` or `.`
      if (!isNaN(btn) || btn === ".") {
        if (btn === "." && /^\d+$/.test(currNum)) {
          currNum = currNum + btn;
        } else if (!isNaN(btn)) {
          if (prevBtn === "=") result = null;
          // 4 +
          // 4 + 4 +
          currNum =
            (!isNaN(prevBtn) && prevBtn !== null && mainScreen.value !== "0") || prevBtn === "." ? currNum + btn : btn;
        }
        mathOpPress = false;
        updateMainScreen(currNum);
        // btn clicked is `Sign`
      } else {
        // update history
        if (btn === "-" || btn === "+" || btn === "*" || btn === "/") {
          // for example, when `-` is pressed, add `0 -` to history screen
          if ((prevBtn === null || prevBtn === "=") && !isInit) {
            history = "0" + btn;
            mathOpCount++;
          }

          if (!historyScreen.value.length && mainScreen.value.length) {
            history = mainScreen.value + btn;
          }
          // current value
          // mainScreen.value = ''
        }

        // if math op was pressed and result is null
        if (mathOp && result === null) {
          result = Number(currNum);
        }

        // count percents
        if (btn === "%") {
          history = history.slice(0, -(currNum.length + 1));
          currNum = percentage(currNum);
          history += currNum + " ";
          updateMainScreen(currNum);
          // count square or square root
        } else if (btn === "sqrt" || btn === "1/x" || btn === "+/-") {
          // btn: +, prevbtn: 9
          // if (isNaN(prevBtn)) {
          //   // btn = mainScreen.value;
          //   prevBtn = mainScreen.value;
          //   prevMathOp = addition;
          //   currNum = mainScreen.value;
          //   history = '9+9';
          // }

          history =
            history.slice(0, -(currNum.length + btn.length)) +
            (btn === "1/x"
              ? "1/(" + currNum + ") "
              : btn === "+/-"
              ? "-1*(" + currNum + ") "
              : btn + "(" + currNum + ") "); // sqrt

          currNum =
            btn === "sqrt"
              ? squareRoot(mainScreen.value)
              : btn === "1/x"
              ? fraction(mainScreen.value)
              : negative(mainScreen.value);

          updateMainScreen(currNum);
          updateHistoryScreen(history);
        }

        // 4 + 5 +  => 9 sqrt
        // count result
        if (btn === "=") {
          // if math op exists
          if (mathOp) {
            mathOpCount = 0;
            if (mathOpPress) {
              // if last button pressed is `mathOperation`
              // like `+, - etc.` before `=` was pressed
              // mathOp(prevResult);
              mathOp(currNum);
            } else {
              // if last button pressed is `digit` before `=` was pressed
              mathOp(Number(currNum));
            }

            history = "";
            prevBtn = btn;

            updateMainScreen(result);
            updateHistoryScreen(history);

            return;
          }
        }

        // count math ops
        // if sign was pressed and prev btn isn't sign and except some buttons
        if (
          isNaN(btn) &&
          (!isNaN(prevBtn) || prevBtn === "%" || prevBtn === "sqrt" || prevBtn === "1/x") &&
          btn !== "=" &&
          btn !== "C" &&
          btn !== "CS" &&
          btn !== "." &&
          btn !== "%" &&
          btn !== "sqrt" &&
          btn !== "1/x"
        ) {
          mathOpCount++;
        }

        // count result in row
        if (
          mathOpCount >= 2 &&
          (!isNaN(prevBtn) || prevBtn === "sqrt" || prevBtn === "sqr" || prevBtn === "1/x" || prevBtn === "%") &&
          btn !== "CS"
        ) {
          prevMathOp(Number(currNum)); // result

          // new
          prevResult = result;
          currNum = result;
          // history
          history = result + btn;
          mathOpCount = 1;
          // new
          updateMainScreen(result);
        }

        if (btn === "CS") {
          if (result != mainScreen.value && ["sqrt", "%", "1/x", "+/-"].indexOf(prevBtn) === -1) {
            currNum = currNum.slice(0, -1);
            history = history.slice(0, -1);
            if (!currNum.length) {
              currNum = "0";
            }
            updateMainScreen(currNum);
          } else {
            return;
          }
        }

        if (result !== null && btn !== "CS") {
          updateHistoryScreen(history);
        }
      }

      prevBtn = btn;
      prevResult = result;
      isInit = false;
    }

    function updateMainScreen(val) {
      val = String(val);
      mainScreen.value = val;
    }

    function updateHistoryScreen(history) {
      historyScreen.value = history;
    }

    function addition(val) {
      result = Number(new BigNumber(result).plus(val).toFixed(4));
    }

    function subtraction(val) {
      result = Number(new BigNumber(result).minus(val).toFixed(4));
    }

    function division(val) {
      result = Number(new BigNumber(result).dividedBy(val).toFixed(4));
    }

    function multiplication(val) {
      result = Number(new BigNumber(result).times(val).toFixed(4));
    }

    // sqrt
    function squareRoot(val) {
      return Number(new BigNumber(val).sqrt().toFixed(4));
    }

    // %
    function percentage(val) {
      return Number(new BigNumber(val).dividedBy(100).toFixed(4));
    }

    // 1/x
    function fraction(val) {
      return Number(new BigNumber(1).dividedBy(val).toFixed(4));
    }

    // +/-
    function negative(val) {
      return -1 * val;
    }
  })();
};

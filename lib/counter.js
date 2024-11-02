var EventEmitter = require("events").EventEmitter;

function Counter() {
  // This line calls the EventEmitter constructor with this as its context,
  //  effectively extending Counter with EventEmitter.This lets the Counter object use
  //  all of EventEmitter's methods, like .emit() and .on(), allowing it to emit and
  //  listen to events.
  EventEmitter.call(this);

  //  This initializes the value property to 0, which will be the counter that can be
  // incremented or decremented.
  this.value = 0;
}
//This line sets up inheritance so that Counter has access to EventEmitter methods.
Counter.prototype = Object.create(EventEmitter.prototype);

Counter.prototype.increment = function increment() {
  this.value++;
};

Counter.prototype.decrement = function decrement() {
  if (--this.value === 0) this.emit("zero");
};

Counter.prototype.isZero = function isZero() {
  return this.value === 0;
};

Counter.prototype.onceZero = function onceZero(fn) {
  if (this.isZero()) return fn();

  this.once("zero", fn);
};

module.exports = Counter;

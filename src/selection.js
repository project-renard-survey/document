
var Substance = require('substance');

function Selection() {
}

Selection.Prototype = function() {

  this.isNull = function() {
    return true;
  };

  this.getRanges = function() {
    return []
  };

  this.isMultiSeletion = function() {
    false;
  };

  this.isPropertySelection = function() {
    false;
  };

  this.isCollapsed = function() {
    return true;
  };

  this.isReverse = function() {
    return false;
  };

  this.equals = function(other) {
    return this === other;
  };

};

Substance.initClass(Selection);

Selection.NullSelection = Object.freeze(new Selection());

module.exports = Selection;

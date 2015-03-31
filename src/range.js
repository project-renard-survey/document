
var Substance = require('substance');

var Range = function(start, end) {
  this.start = start;
  this.end = end;
};

Range.Prototype = function() {

  this.isCollapsed = function() {
    return this.start === this.end;
  };

  this.equals = function(other) {
    if (this === other) return true;
    else return (this.start.equals(other.start) && this.end.equals(other.end));
  };

};

Substance.initClass(Range);

module.exports = Range;

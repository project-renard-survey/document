'use strict';

var Substance = require('substance');
var Model = require('./model');

function Node() {
  Model.apply(this, arguments);
  this.documentModel = null;
}

Node.Prototype = function dmNodePrototype() {

  this.attach = function( documentModel ) {
    this.documentModel = documentModel;
  };

  this.detach = function() {
    this.documentModel = null;
  };

  this.isAttached = function() {
    return this.documentModel !== null;
  };

  this.getDocument = function() {
    return this.documentModel;
  };
};

Substance.inherit(Node, Model);

Node.static.name = "node";

Node.extend = Substance.bind( Model.__extend__, null, Node);

module.exports = Node;

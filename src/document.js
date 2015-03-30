'use strict';

var Substance = require('substance');
var AnnotationIndex = require('./annotation-index');
var DocumentListeners = require('./document-listeners');
var DocumentHistory = require('./document-history');
var Data = require('substance-data/versioned');
var ChangeMap = require('./change-map');

function Document( schema, seed ) {

  this.schema = schema;
  this.data = new Data({
    seed: seed,
    nodeFactory: Substance.bind(this.__createNode, this)
  });

  this.annotationIndex = new AnnotationIndex(this);
  this.indexes['annotations'] = this.annotationIndex;

  this.operationListeners = [];
  this.data.on('operation:applied', Substance.bind(this.onOperationApplied, this));

  this.isTransacting = false;
  this.transactionListeners = new DocumentListeners();
  this.transactionChanges = null;

  this.history = new DocumentHistory(this);
}

Document.Prototype = function() {

  this.get = function(path) {
    return this.data.get(path);
  };

  this.getAnnotations = function(path, start, end) {
    var sStart = start;
    var sEnd = end;
    var annotations = this.annotationIndex.get(path);
    var result = [];
    // Filter the annotations by the given char range
    if (start) {
      // Note: this treats all annotations as if they were inclusive (left+right)
      // TODO: maybe we should apply the same rules as for Transformations?
      Substance.each(annotations, function(a) {
        var aStart = a.range[0];
        var aEnd = a.range[1];
        var overlap = (aEnd >= sStart);
        // Note: it is allowed to omit the end part
        if (sEnd) {
          overlap &= (aStart <= sEnd);
        }
        if (overlap) {
          result.push(this.get(a.id));
        }
      }, this);
    } else {
      Substance.each(annotations, function(anno) {
        result.push(this.get(anno.id));
      }, this);
    }
    return result;
  };

  this.__createNode = function(nodeData) {
    if (nodeData instanceof Node) {
      return nodeData;
    }
    var node = this.schema.createNode(nodeData.type, nodeData);
    node.setDocument(this);
  };

  this.create = function(node) {
    node = this.data.create(node);
  };

  this.delete = function(nodeOrId) {
    var node, id;
    if (Substance.isString(nodeOrId)) {
      id = nodeOrId;
      node = this.graph.get(id);
    } else if (nodeOrId instanceof Node) {
      node = nodeOrId;
      id = node.id;
    } else {
      throw new Error('Illegal argument');
    }
    if (!node) {
      console.error("Unknown node '%s'", id);
    }
    this.data.delete(id);
    node.setDocument(null);
  };

  this.set = function(path, value) {
    this.data.set(path, value);
  };

  this.update = function(path, diff) {
    this.data.update(path, diff);
  };

  this.startTransaction = function() {
    if (this.isTransacting) {
      throw new Error('Nested transactions are not supported yet.');
    }
    this.isTransacting = true;
    this.transactionChanges = new ChangeMap();
    this.history.setRecoveryPoint();
  };

  this.cancelTransaction = function() {
    if (!this.isTransacting) {
      throw new Error('Not in a transaction.');
    }
    this.history.restoreLastRecoveryPoint();
    this.isTransacting = false;
  };

  this.finishTransaction = function() {
    if (!this.isTransacting) {
      throw new Error('Not in a transaction.');
    }
    // TODO: notify external listeners
    this.isTransacting = false;
    this.history.setRecoveryPoint();
    this.notifyTransactionApplied(this.transactionChanges);
  };

  this.toJSON = function() {
    return {
      schema: [this.schema.name, this.schema.version],
      nodes: this.nodes
    };
  };

  this.onOperationApplied = function(op) {
    // record the change for the transaction summary event later
    this.transactionChanges.update(op);
    var failed = [];
    Substance.each(this.operationListeners, function(listener) {
      try {
        listener.onOperationApplied(op);
      } catch (error) {
        console.error(error);
        failed.push(listener);
      }
    });
    Substance.each(failed, function(listener) {
      listener.reset();
    });
  };

  this.addOperationListener = function(listener, priority) {
    listener.__priority = priority || 10;
    this.operationListeners.push(listener);
    this.operationListeners.sort(function(a,b) {
      return a.__priority - b.__priority;
    });
  };

  this.removeOperationListener = function(listener) {
    var idx = this.operationListeners.indexOf(listener);
    if (idx >= 0) {
      this.operationListeners.splice(idx, 1);
    }
  };

  this.addTransactionListener = function(path, listener) {
    this.transactionListeners.add(path, listener);
  };

  this.removeTransactionListener = function(path, listener) {
    this.transactionListeners.remove(path, listener);
  };

  this.notifyTransactionApplied = function(transactionChanges) {
    transactionChanges.traverse(function(path, ops) {
      this.transactionListeners.notify(path, ops);
    }, this);
  };

};

Substance.initClass(Document);

module.exports = Document;

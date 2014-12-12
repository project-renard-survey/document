"use strict";

// Substance.Document 0.5.0
// (c) 2010-2013 Michael Aufreiter
// Substance.Document may be freely distributed under the MIT license.
// For all details and documentation:
// http://interior.substance.io/modules/document.html


// Import
// ========

var _ = require("underscore");
var util = require("substance-util");
var errors = util.errors;
var Data = require("substance-data");
var Operator = require("substance-operator");
var Container = require("./container");

// Module
// ========

var DocumentError = errors.define("DocumentError");

// Document
// --------
//
// A generic model for representing and transforming digital documents

var Document = function(options) {
  Data.Graph.call(this, options.schema, options);

  // Temporary store for file data
  // Used by File Nodes for storing file contents either as blobs or strings
  this.fileData = {};

  this.addIndex("annotations", {
    types: ["annotation"],
    property: "path"
  });

  // Index for supplements
  this.addIndex("files", {
    types: ["file"]
  });


};

// Default Document Schema
// --------

Document.schema = {
  // Static indexes
  "indexes": {
  },

  "types": {
    // Specific type for substance documents, holding all content elements
    "content": {
      "properties": {
      }
    },

    // Note: we switch to 'container' as 'view' is confusing in presence of Application.View
    // TODO: remove 'view'... make sure to have migrations in place
    "container": {
      "properties": {
        "nodes": ["array", "content"]
      }
    },
    "view": {
      "properties": {
        "nodes": ["array", "content"]
      }
    }
  }
};


Document.Prototype = function() {
  var __super__ = util.prototype(this);

  this.getIndex = function(name) {
    return this.indexes[name];
  };

  this.getSchema = function() {
    return this.schema;
  };

  this.create = function(node) {
    __super__.create.call(this, node);
    return this.get(node.id);
  };

  // Delegates to Graph.get but wraps the result in the particular node constructor
  // --------
  //

  this.get = function(path) {
    var node = __super__.get.call(this, path);

    if (!node) return node;

    // Wrap all nodes in an appropriate Node instance
    var nodeSpec = this.nodeTypes[node.type];
    var NodeType = (nodeSpec !== undefined) ? nodeSpec.Model : null;
    if (NodeType && !(node instanceof NodeType)) {
      node = new NodeType(node, this);
      this.nodes[node.id] = node;
    }

    // wrap containers (~views) into Container instances
    // TODO: get rid of the 'view' type... it is misleading in presence of Application.Views.
    if ((node.type === "view" || node.type === "container") && !(node instanceof Container)) {
      node = new Container(this, node.id);
      this.nodes[node.id] = node;
    }

    return node;
  };

  // Serialize to JSON
  // --------
  //
  // The command is converted into a sequence of graph commands

  this.toJSON = function() {
    var res = __super__.toJSON.call(this);
    res.id = this.id;
    return res;
  };

  // Hide elements from provided view
  // --------
  //

  this.hide = function(viewId, nodes) {
    var view = this.get(viewId);

    if (!view) {
      throw new DocumentError("Invalid view id: "+ viewId);
    }

    if (_.isString(nodes)) {
      nodes = [nodes];
    }

    var indexes = [];
    _.each(nodes, function(n) {
      var i = view.nodes.indexOf(n);
      if (i>=0) indexes.push(i);
    }, this);

    if (indexes.length === 0) return;

    indexes = indexes.sort().reverse();
    indexes = _.uniq(indexes);

    var ops = _.map(indexes, function(index) {
      return Operator.ArrayOperation.Delete(index, view.nodes[index]);
    });

    var op = Operator.ObjectOperation.Update([viewId, "nodes"], Operator.ArrayOperation.Compound(ops));

    return this.apply(op);
  };

  // HACK: it is not desired to have the comments managed along with the editorially document updates
  // We need an approach with multiple Chronicles instead.
  this.comment = function(comment) {
    var id = util.uuid();
    comment.id = id;
    comment.type = "comment";
    var op = Operator.ObjectOperation.Create([comment.id], comment);
    return this.__apply__(op);
  };

  this.annotate = function(anno, data) {
    anno.id = anno.type + "_" + util.uuid();
    _.extend(anno, data);
    this.create(anno);
  };

  // Adds nodes to a view
  // --------
  //

  this.show = function(viewId, nodes, target) {
    if (target === undefined) target = -1;

    var view = this.get(viewId);
    if (!view) {
      throw new DocumentError("Invalid view id: " + viewId);
    }

    if (_.isString(nodes)) {
      nodes = [nodes];
    }

    var l = view.nodes.length;

    // target index can be given as negative number (as known from python/ruby)
    target = Math.min(target, l);
    if (target<0) target = Math.max(0, l+target+1);

    var ops = [];
    for (var idx = 0; idx < nodes.length; idx++) {
      var nodeId = nodes[idx];
      if (this.nodes[nodeId] === undefined) {
        throw new DocumentError("Invalid node id: " + nodeId);
      }
      ops.push(Operator.ArrayOperation.Insert(target + idx, nodeId));
    }

    if (ops.length > 0) {
      var update = Operator.ObjectOperation.Update([viewId, "nodes"], Operator.ArrayOperation.Compound(ops));
      return this.apply(update);
    }
  };

  // Start simulation, which conforms to a transaction (think databases)
  // --------
  //

  this.startSimulation = function() {
    // TODO: this should be implemented in a more cleaner and efficient way.
    // Though, for now and sake of simplicity done by creating a copy
    var self = this;
    var simulation = this.fromSnapshot(this.toJSON());
    var ops = [];
    simulation.ops = ops;

    var __apply__ = simulation.apply;

    simulation.apply = function(op) {
      ops.push(op);
      op = __apply__.call(simulation, op);
      return op;
    };

    simulation.save = function(data) {

      // HACK: write back all binaries that have been created on the simulation doc
      // we do that before we apply the operations so that listeners can access the
      // data
      // TODO: when the composer is feature complete we need to refactor the
      // transaction stuff
      _.each(simulation.fileData, function(data, key) {
        self.fileData[key] = data;
      });

      var _ops = [];
      for (var i = 0; i < ops.length; i++) {
        if (ops[i].type !== "compound") {
          _ops.push(ops[i]);
        } else {
          _ops = _ops.concat(ops[i].ops);
        }
      }
      if (_ops.length === 0) {
        // nothing has been recorded
        return;
      }
      var compound = Operator.ObjectOperation.Compound(_ops);
      if (data) compound.data = _.clone(data);
      self.apply(compound);

    };

    simulation.simulation = true;
    return simulation;
  };

  this.fromSnapshot = function(data, options) {
    return Document.fromSnapshot(data, options);
  };

  this.newInstance = function() {
    return new Document({ "schema": this.schema });
  };

  this.uuid = function(type) {
    return type + "_" + util.uuid();
  };
};

Document.Prototype.prototype = Data.Graph.prototype;
Document.prototype = new Document.Prototype();

Document.fromSnapshot = function(data, options) {
  options = options || {};
  options.seed = data;
  return new Document(options);
};


Document.DocumentError = DocumentError;

// Export
// ========

module.exports = Document;

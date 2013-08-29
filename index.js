"use strict";

var Document = require('./src/document');
Document.Annotator = require('./src/annotator');
Document.Container = require('./src/container');
Document.Cursor = require('./src/cursor');
Document.Selection = require('./src/selection');
Document.Controller = require('./src/controller');

Document.Node = require('./src/node');
Document.Composite = require('./src/composite');

// Compatibility
Document.Writer = require('./src/controller');

var nodes = require('./src/nodes');
Document.Text = nodes.Text;

module.exports = Document;

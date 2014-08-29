var path = require('path');
var url = require('url');
var fs = require('fs');

var JSEXT = '.js';
var routes = {};
var nodeEnv = process.env.NODE_ENV || 'development';
var isDevelopment = nodeEnv === 'development';

var discover = function(ctrlPath) {
  var contents = fs.readdirSync(ctrlPath);
  var i = contents.length
  while(i--) {
    var item = contents[i];
    var fullPath = path.resolve(process.cwd(), path.join(ctrlPath, item));
    var stats = fs.statSync(fullPath);
    if (stats.isFile() && path.extname(fullPath) === JSEXT) {
      var controllerName = path.basename(fullPath, JSEXT).replace('_ctrl', '').replace('_controller', '');
      var controller = require(fullPath);
      for (var actionDef in controller) {
        routes[controllerName + '/' + actionDef] = controller[actionDef]; 
      }
    } else if (stats.isDirectory()) {
      discover(fullPath);
    }
  }
};

var extendRequestProperties = function(req) {
  var props = [
    'query', 'cookies', 'signedCookies', 'ip', 'ips', 'path', 'hostname', 'fresh', 'stale', 'xhr',
    'protocol', 'secure', 'subdomains', 'headers'
  ];

  var i = props.length
  while(i--) {
    var prop = props[i];
    this[prop] = req[prop];
  };
};

var extendRequestMethods = function(req) {
  var methods = ['get', 'accepts', 'acceptsCharsets', 'acceptsLanguages', 'acceptsEncodings', 'is'];

  var i = methods.length;
  while(i--) {
    var method = methods[i];
    this[method] = (function(m) {
      return function() {
        return req[m].apply(req, arguments);
      }
    })(method);
  };
};

var extendResponseProperties = function(res) {
  var props = ['locals', 'headersSent'];

  var i = props.length;
  while(i--) {
    var prop = props[i];
    this[prop] = res[prop];
  }
};

var extendResponseMethods = function(res) {
  var methods = [
    'status', 'set', 'cookie', 'clearCookie', 'redirect', 'location', 'send', 'json',
    'jsonp', 'type', 'format', 'attachment', 'sendFile', 'download', 'links', 'render',
    'vary', 'end'
  ];

  var i = methods.length;
  while(i--) {
    var method = methods[i];
    this[method] = (function(m) {
      return function() {
        return res[m].apply(res, arguments);
      }
    })(method);
  };
};

function Action(req, res, next) {
  var verb = req.method;
  var addr = req.url;
  var uri = url.parse(addr);
  var pathname = (uri.pathname === '/') ? '/root/index' : uri.pathname;
  var pathSplit = pathname.split('/').slice(1);
  var controllerName = pathSplit[0];
  var actionName = pathSplit[1];
  var params = pathSplit.slice(2);
  var actionDef = routes[controllerName + '/' + actionName];
  var actionFn; if (actionDef) actionFn = actionDef[verb.toLowerCase()];
  
  this.req = req;
  this.res = res;
  this.body = req.body;
  this.controllerName = controllerName;
  this.actionName = actionName;
  this.params = params;
  this.exists = actionFn !== undefined;
  this.locals = res.locals;
  this.userAgent = req.headers['user-agent'];

  extendRequestProperties.call(this, req);
  extendRequestMethods.call(this, req);
  extendResponseProperties.call(this, res);
  extendResponseMethods.call(this, res);

  this.invoke = function(ctx) {
    actionFn.apply(this, this.params);
  };

};

module.exports = function(options) {

  var options = options || {};
  var controllerDir = options.controllerDir || 'app/controllers';

  discover(controllerDir);

  return function(req, res, next) {
    if (isDevelopment) discover(controllerDir);    
    var action = new Action(req, res, next);
    if (action.exists) {
      action.invoke(this);
    } else {
      next();
    }
  }

};

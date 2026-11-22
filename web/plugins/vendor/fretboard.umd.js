(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.fretboard = {}));
})(this, (function (exports) { 'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */

    function __rest(s, e) {
        var t = {};
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
            t[p] = s[p];
        if (s != null && typeof Object.getOwnPropertySymbols === "function")
            for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
                if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                    t[p[i]] = s[p[i]];
            }
        return t;
    }

    var xhtml = "http://www.w3.org/1999/xhtml";

    var namespaces = {
      svg: "http://www.w3.org/2000/svg",
      xhtml: xhtml,
      xlink: "http://www.w3.org/1999/xlink",
      xml: "http://www.w3.org/XML/1998/namespace",
      xmlns: "http://www.w3.org/2000/xmlns/"
    };

    function namespace(name) {
      var prefix = name += "", i = prefix.indexOf(":");
      if (i >= 0 && (prefix = name.slice(0, i)) !== "xmlns") name = name.slice(i + 1);
      return namespaces.hasOwnProperty(prefix) ? {space: namespaces[prefix], local: name} : name;
    }

    function creatorInherit(name) {
      return function() {
        var document = this.ownerDocument,
            uri = this.namespaceURI;
        return uri === xhtml && document.documentElement.namespaceURI === xhtml
            ? document.createElement(name)
            : document.createElementNS(uri, name);
      };
    }

    function creatorFixed(fullname) {
      return function() {
        return this.ownerDocument.createElementNS(fullname.space, fullname.local);
      };
    }

    function creator(name) {
      var fullname = namespace(name);
      return (fullname.local
          ? creatorFixed
          : creatorInherit)(fullname);
    }

    function none() {}

    function selector(selector) {
      return selector == null ? none : function() {
        return this.querySelector(selector);
      };
    }

    function selection_select(select) {
      if (typeof select !== "function") select = selector(select);

      for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
        for (var group = groups[j], n = group.length, subgroup = subgroups[j] = new Array(n), node, subnode, i = 0; i < n; ++i) {
          if ((node = group[i]) && (subnode = select.call(node, node.__data__, i, group))) {
            if ("__data__" in node) subnode.__data__ = node.__data__;
            subgroup[i] = subnode;
          }
        }
      }

      return new Selection(subgroups, this._parents);
    }

    function empty() {
      return [];
    }

    function selectorAll(selector) {
      return selector == null ? empty : function() {
        return this.querySelectorAll(selector);
      };
    }

    function selection_selectAll(select) {
      if (typeof select !== "function") select = selectorAll(select);

      for (var groups = this._groups, m = groups.length, subgroups = [], parents = [], j = 0; j < m; ++j) {
        for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
          if (node = group[i]) {
            subgroups.push(select.call(node, node.__data__, i, group));
            parents.push(node);
          }
        }
      }

      return new Selection(subgroups, parents);
    }

    function matcher(selector) {
      return function() {
        return this.matches(selector);
      };
    }

    function selection_filter(match) {
      if (typeof match !== "function") match = matcher(match);

      for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
        for (var group = groups[j], n = group.length, subgroup = subgroups[j] = [], node, i = 0; i < n; ++i) {
          if ((node = group[i]) && match.call(node, node.__data__, i, group)) {
            subgroup.push(node);
          }
        }
      }

      return new Selection(subgroups, this._parents);
    }

    function sparse(update) {
      return new Array(update.length);
    }

    function selection_enter() {
      return new Selection(this._enter || this._groups.map(sparse), this._parents);
    }

    function EnterNode(parent, datum) {
      this.ownerDocument = parent.ownerDocument;
      this.namespaceURI = parent.namespaceURI;
      this._next = null;
      this._parent = parent;
      this.__data__ = datum;
    }

    EnterNode.prototype = {
      constructor: EnterNode,
      appendChild: function(child) { return this._parent.insertBefore(child, this._next); },
      insertBefore: function(child, next) { return this._parent.insertBefore(child, next); },
      querySelector: function(selector) { return this._parent.querySelector(selector); },
      querySelectorAll: function(selector) { return this._parent.querySelectorAll(selector); }
    };

    function constant(x) {
      return function() {
        return x;
      };
    }

    var keyPrefix = "$"; // Protect against keys like “__proto__”.

    function bindIndex(parent, group, enter, update, exit, data) {
      var i = 0,
          node,
          groupLength = group.length,
          dataLength = data.length;

      // Put any non-null nodes that fit into update.
      // Put any null nodes into enter.
      // Put any remaining data into enter.
      for (; i < dataLength; ++i) {
        if (node = group[i]) {
          node.__data__ = data[i];
          update[i] = node;
        } else {
          enter[i] = new EnterNode(parent, data[i]);
        }
      }

      // Put any non-null nodes that don’t fit into exit.
      for (; i < groupLength; ++i) {
        if (node = group[i]) {
          exit[i] = node;
        }
      }
    }

    function bindKey(parent, group, enter, update, exit, data, key) {
      var i,
          node,
          nodeByKeyValue = {},
          groupLength = group.length,
          dataLength = data.length,
          keyValues = new Array(groupLength),
          keyValue;

      // Compute the key for each node.
      // If multiple nodes have the same key, the duplicates are added to exit.
      for (i = 0; i < groupLength; ++i) {
        if (node = group[i]) {
          keyValues[i] = keyValue = keyPrefix + key.call(node, node.__data__, i, group);
          if (keyValue in nodeByKeyValue) {
            exit[i] = node;
          } else {
            nodeByKeyValue[keyValue] = node;
          }
        }
      }

      // Compute the key for each datum.
      // If there a node associated with this key, join and add it to update.
      // If there is not (or the key is a duplicate), add it to enter.
      for (i = 0; i < dataLength; ++i) {
        keyValue = keyPrefix + key.call(parent, data[i], i, data);
        if (node = nodeByKeyValue[keyValue]) {
          update[i] = node;
          node.__data__ = data[i];
          nodeByKeyValue[keyValue] = null;
        } else {
          enter[i] = new EnterNode(parent, data[i]);
        }
      }

      // Add any remaining nodes that were not bound to data to exit.
      for (i = 0; i < groupLength; ++i) {
        if ((node = group[i]) && (nodeByKeyValue[keyValues[i]] === node)) {
          exit[i] = node;
        }
      }
    }

    function selection_data(value, key) {
      if (!value) {
        data = new Array(this.size()), j = -1;
        this.each(function(d) { data[++j] = d; });
        return data;
      }

      var bind = key ? bindKey : bindIndex,
          parents = this._parents,
          groups = this._groups;

      if (typeof value !== "function") value = constant(value);

      for (var m = groups.length, update = new Array(m), enter = new Array(m), exit = new Array(m), j = 0; j < m; ++j) {
        var parent = parents[j],
            group = groups[j],
            groupLength = group.length,
            data = value.call(parent, parent && parent.__data__, j, parents),
            dataLength = data.length,
            enterGroup = enter[j] = new Array(dataLength),
            updateGroup = update[j] = new Array(dataLength),
            exitGroup = exit[j] = new Array(groupLength);

        bind(parent, group, enterGroup, updateGroup, exitGroup, data, key);

        // Now connect the enter nodes to their following update node, such that
        // appendChild can insert the materialized enter node before this node,
        // rather than at the end of the parent node.
        for (var i0 = 0, i1 = 0, previous, next; i0 < dataLength; ++i0) {
          if (previous = enterGroup[i0]) {
            if (i0 >= i1) i1 = i0 + 1;
            while (!(next = updateGroup[i1]) && ++i1 < dataLength);
            previous._next = next || null;
          }
        }
      }

      update = new Selection(update, parents);
      update._enter = enter;
      update._exit = exit;
      return update;
    }

    function selection_exit() {
      return new Selection(this._exit || this._groups.map(sparse), this._parents);
    }

    function selection_join(onenter, onupdate, onexit) {
      var enter = this.enter(), update = this, exit = this.exit();
      enter = typeof onenter === "function" ? onenter(enter) : enter.append(onenter + "");
      if (onupdate != null) update = onupdate(update);
      if (onexit == null) exit.remove(); else onexit(exit);
      return enter && update ? enter.merge(update).order() : update;
    }

    function selection_merge(selection) {

      for (var groups0 = this._groups, groups1 = selection._groups, m0 = groups0.length, m1 = groups1.length, m = Math.min(m0, m1), merges = new Array(m0), j = 0; j < m; ++j) {
        for (var group0 = groups0[j], group1 = groups1[j], n = group0.length, merge = merges[j] = new Array(n), node, i = 0; i < n; ++i) {
          if (node = group0[i] || group1[i]) {
            merge[i] = node;
          }
        }
      }

      for (; j < m0; ++j) {
        merges[j] = groups0[j];
      }

      return new Selection(merges, this._parents);
    }

    function selection_order() {

      for (var groups = this._groups, j = -1, m = groups.length; ++j < m;) {
        for (var group = groups[j], i = group.length - 1, next = group[i], node; --i >= 0;) {
          if (node = group[i]) {
            if (next && node.compareDocumentPosition(next) ^ 4) next.parentNode.insertBefore(node, next);
            next = node;
          }
        }
      }

      return this;
    }

    function selection_sort(compare) {
      if (!compare) compare = ascending;

      function compareNode(a, b) {
        return a && b ? compare(a.__data__, b.__data__) : !a - !b;
      }

      for (var groups = this._groups, m = groups.length, sortgroups = new Array(m), j = 0; j < m; ++j) {
        for (var group = groups[j], n = group.length, sortgroup = sortgroups[j] = new Array(n), node, i = 0; i < n; ++i) {
          if (node = group[i]) {
            sortgroup[i] = node;
          }
        }
        sortgroup.sort(compareNode);
      }

      return new Selection(sortgroups, this._parents).order();
    }

    function ascending(a, b) {
      return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
    }

    function selection_call() {
      var callback = arguments[0];
      arguments[0] = this;
      callback.apply(null, arguments);
      return this;
    }

    function selection_nodes() {
      var nodes = new Array(this.size()), i = -1;
      this.each(function() { nodes[++i] = this; });
      return nodes;
    }

    function selection_node() {

      for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
        for (var group = groups[j], i = 0, n = group.length; i < n; ++i) {
          var node = group[i];
          if (node) return node;
        }
      }

      return null;
    }

    function selection_size() {
      var size = 0;
      this.each(function() { ++size; });
      return size;
    }

    function selection_empty() {
      return !this.node();
    }

    function selection_each(callback) {

      for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
        for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i) {
          if (node = group[i]) callback.call(node, node.__data__, i, group);
        }
      }

      return this;
    }

    function attrRemove(name) {
      return function() {
        this.removeAttribute(name);
      };
    }

    function attrRemoveNS(fullname) {
      return function() {
        this.removeAttributeNS(fullname.space, fullname.local);
      };
    }

    function attrConstant(name, value) {
      return function() {
        this.setAttribute(name, value);
      };
    }

    function attrConstantNS(fullname, value) {
      return function() {
        this.setAttributeNS(fullname.space, fullname.local, value);
      };
    }

    function attrFunction(name, value) {
      return function() {
        var v = value.apply(this, arguments);
        if (v == null) this.removeAttribute(name);
        else this.setAttribute(name, v);
      };
    }

    function attrFunctionNS(fullname, value) {
      return function() {
        var v = value.apply(this, arguments);
        if (v == null) this.removeAttributeNS(fullname.space, fullname.local);
        else this.setAttributeNS(fullname.space, fullname.local, v);
      };
    }

    function selection_attr(name, value) {
      var fullname = namespace(name);

      if (arguments.length < 2) {
        var node = this.node();
        return fullname.local
            ? node.getAttributeNS(fullname.space, fullname.local)
            : node.getAttribute(fullname);
      }

      return this.each((value == null
          ? (fullname.local ? attrRemoveNS : attrRemove) : (typeof value === "function"
          ? (fullname.local ? attrFunctionNS : attrFunction)
          : (fullname.local ? attrConstantNS : attrConstant)))(fullname, value));
    }

    function defaultView(node) {
      return (node.ownerDocument && node.ownerDocument.defaultView) // node is a Node
          || (node.document && node) // node is a Window
          || node.defaultView; // node is a Document
    }

    function styleRemove(name) {
      return function() {
        this.style.removeProperty(name);
      };
    }

    function styleConstant(name, value, priority) {
      return function() {
        this.style.setProperty(name, value, priority);
      };
    }

    function styleFunction(name, value, priority) {
      return function() {
        var v = value.apply(this, arguments);
        if (v == null) this.style.removeProperty(name);
        else this.style.setProperty(name, v, priority);
      };
    }

    function selection_style(name, value, priority) {
      return arguments.length > 1
          ? this.each((value == null
                ? styleRemove : typeof value === "function"
                ? styleFunction
                : styleConstant)(name, value, priority == null ? "" : priority))
          : styleValue(this.node(), name);
    }

    function styleValue(node, name) {
      return node.style.getPropertyValue(name)
          || defaultView(node).getComputedStyle(node, null).getPropertyValue(name);
    }

    function propertyRemove(name) {
      return function() {
        delete this[name];
      };
    }

    function propertyConstant(name, value) {
      return function() {
        this[name] = value;
      };
    }

    function propertyFunction(name, value) {
      return function() {
        var v = value.apply(this, arguments);
        if (v == null) delete this[name];
        else this[name] = v;
      };
    }

    function selection_property(name, value) {
      return arguments.length > 1
          ? this.each((value == null
              ? propertyRemove : typeof value === "function"
              ? propertyFunction
              : propertyConstant)(name, value))
          : this.node()[name];
    }

    function classArray(string) {
      return string.trim().split(/^|\s+/);
    }

    function classList(node) {
      return node.classList || new ClassList(node);
    }

    function ClassList(node) {
      this._node = node;
      this._names = classArray(node.getAttribute("class") || "");
    }

    ClassList.prototype = {
      add: function(name) {
        var i = this._names.indexOf(name);
        if (i < 0) {
          this._names.push(name);
          this._node.setAttribute("class", this._names.join(" "));
        }
      },
      remove: function(name) {
        var i = this._names.indexOf(name);
        if (i >= 0) {
          this._names.splice(i, 1);
          this._node.setAttribute("class", this._names.join(" "));
        }
      },
      contains: function(name) {
        return this._names.indexOf(name) >= 0;
      }
    };

    function classedAdd(node, names) {
      var list = classList(node), i = -1, n = names.length;
      while (++i < n) list.add(names[i]);
    }

    function classedRemove(node, names) {
      var list = classList(node), i = -1, n = names.length;
      while (++i < n) list.remove(names[i]);
    }

    function classedTrue(names) {
      return function() {
        classedAdd(this, names);
      };
    }

    function classedFalse(names) {
      return function() {
        classedRemove(this, names);
      };
    }

    function classedFunction(names, value) {
      return function() {
        (value.apply(this, arguments) ? classedAdd : classedRemove)(this, names);
      };
    }

    function selection_classed(name, value) {
      var names = classArray(name + "");

      if (arguments.length < 2) {
        var list = classList(this.node()), i = -1, n = names.length;
        while (++i < n) if (!list.contains(names[i])) return false;
        return true;
      }

      return this.each((typeof value === "function"
          ? classedFunction : value
          ? classedTrue
          : classedFalse)(names, value));
    }

    function textRemove() {
      this.textContent = "";
    }

    function textConstant(value) {
      return function() {
        this.textContent = value;
      };
    }

    function textFunction(value) {
      return function() {
        var v = value.apply(this, arguments);
        this.textContent = v == null ? "" : v;
      };
    }

    function selection_text(value) {
      return arguments.length
          ? this.each(value == null
              ? textRemove : (typeof value === "function"
              ? textFunction
              : textConstant)(value))
          : this.node().textContent;
    }

    function htmlRemove() {
      this.innerHTML = "";
    }

    function htmlConstant(value) {
      return function() {
        this.innerHTML = value;
      };
    }

    function htmlFunction(value) {
      return function() {
        var v = value.apply(this, arguments);
        this.innerHTML = v == null ? "" : v;
      };
    }

    function selection_html(value) {
      return arguments.length
          ? this.each(value == null
              ? htmlRemove : (typeof value === "function"
              ? htmlFunction
              : htmlConstant)(value))
          : this.node().innerHTML;
    }

    function raise() {
      if (this.nextSibling) this.parentNode.appendChild(this);
    }

    function selection_raise() {
      return this.each(raise);
    }

    function lower() {
      if (this.previousSibling) this.parentNode.insertBefore(this, this.parentNode.firstChild);
    }

    function selection_lower() {
      return this.each(lower);
    }

    function selection_append(name) {
      var create = typeof name === "function" ? name : creator(name);
      return this.select(function() {
        return this.appendChild(create.apply(this, arguments));
      });
    }

    function constantNull() {
      return null;
    }

    function selection_insert(name, before) {
      var create = typeof name === "function" ? name : creator(name),
          select = before == null ? constantNull : typeof before === "function" ? before : selector(before);
      return this.select(function() {
        return this.insertBefore(create.apply(this, arguments), select.apply(this, arguments) || null);
      });
    }

    function remove() {
      var parent = this.parentNode;
      if (parent) parent.removeChild(this);
    }

    function selection_remove() {
      return this.each(remove);
    }

    function selection_cloneShallow() {
      var clone = this.cloneNode(false), parent = this.parentNode;
      return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
    }

    function selection_cloneDeep() {
      var clone = this.cloneNode(true), parent = this.parentNode;
      return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
    }

    function selection_clone(deep) {
      return this.select(deep ? selection_cloneDeep : selection_cloneShallow);
    }

    function selection_datum(value) {
      return arguments.length
          ? this.property("__data__", value)
          : this.node().__data__;
    }

    var filterEvents = {};

    if (typeof document !== "undefined") {
      var element = document.documentElement;
      if (!("onmouseenter" in element)) {
        filterEvents = {mouseenter: "mouseover", mouseleave: "mouseout"};
      }
    }

    function filterContextListener(listener, index, group) {
      listener = contextListener(listener, index, group);
      return function(event) {
        var related = event.relatedTarget;
        if (!related || (related !== this && !(related.compareDocumentPosition(this) & 8))) {
          listener.call(this, event);
        }
      };
    }

    function contextListener(listener, index, group) {
      return function(event1) {
        try {
          listener.call(this, this.__data__, index, group);
        } finally {
        }
      };
    }

    function parseTypenames(typenames) {
      return typenames.trim().split(/^|\s+/).map(function(t) {
        var name = "", i = t.indexOf(".");
        if (i >= 0) name = t.slice(i + 1), t = t.slice(0, i);
        return {type: t, name: name};
      });
    }

    function onRemove(typename) {
      return function() {
        var on = this.__on;
        if (!on) return;
        for (var j = 0, i = -1, m = on.length, o; j < m; ++j) {
          if (o = on[j], (!typename.type || o.type === typename.type) && o.name === typename.name) {
            this.removeEventListener(o.type, o.listener, o.capture);
          } else {
            on[++i] = o;
          }
        }
        if (++i) on.length = i;
        else delete this.__on;
      };
    }

    function onAdd(typename, value, capture) {
      var wrap = filterEvents.hasOwnProperty(typename.type) ? filterContextListener : contextListener;
      return function(d, i, group) {
        var on = this.__on, o, listener = wrap(value, i, group);
        if (on) for (var j = 0, m = on.length; j < m; ++j) {
          if ((o = on[j]).type === typename.type && o.name === typename.name) {
            this.removeEventListener(o.type, o.listener, o.capture);
            this.addEventListener(o.type, o.listener = listener, o.capture = capture);
            o.value = value;
            return;
          }
        }
        this.addEventListener(typename.type, listener, capture);
        o = {type: typename.type, name: typename.name, value: value, listener: listener, capture: capture};
        if (!on) this.__on = [o];
        else on.push(o);
      };
    }

    function selection_on(typename, value, capture) {
      var typenames = parseTypenames(typename + ""), i, n = typenames.length, t;

      if (arguments.length < 2) {
        var on = this.node().__on;
        if (on) for (var j = 0, m = on.length, o; j < m; ++j) {
          for (i = 0, o = on[j]; i < n; ++i) {
            if ((t = typenames[i]).type === o.type && t.name === o.name) {
              return o.value;
            }
          }
        }
        return;
      }

      on = value ? onAdd : onRemove;
      if (capture == null) capture = false;
      for (i = 0; i < n; ++i) this.each(on(typenames[i], value, capture));
      return this;
    }

    function dispatchEvent(node, type, params) {
      var window = defaultView(node),
          event = window.CustomEvent;

      if (typeof event === "function") {
        event = new event(type, params);
      } else {
        event = window.document.createEvent("Event");
        if (params) event.initEvent(type, params.bubbles, params.cancelable), event.detail = params.detail;
        else event.initEvent(type, false, false);
      }

      node.dispatchEvent(event);
    }

    function dispatchConstant(type, params) {
      return function() {
        return dispatchEvent(this, type, params);
      };
    }

    function dispatchFunction(type, params) {
      return function() {
        return dispatchEvent(this, type, params.apply(this, arguments));
      };
    }

    function selection_dispatch(type, params) {
      return this.each((typeof params === "function"
          ? dispatchFunction
          : dispatchConstant)(type, params));
    }

    var root = [null];

    function Selection(groups, parents) {
      this._groups = groups;
      this._parents = parents;
    }

    Selection.prototype = {
      constructor: Selection,
      select: selection_select,
      selectAll: selection_selectAll,
      filter: selection_filter,
      data: selection_data,
      enter: selection_enter,
      exit: selection_exit,
      join: selection_join,
      merge: selection_merge,
      order: selection_order,
      sort: selection_sort,
      call: selection_call,
      nodes: selection_nodes,
      node: selection_node,
      size: selection_size,
      empty: selection_empty,
      each: selection_each,
      attr: selection_attr,
      style: selection_style,
      property: selection_property,
      classed: selection_classed,
      text: selection_text,
      html: selection_html,
      raise: selection_raise,
      lower: selection_lower,
      append: selection_append,
      insert: selection_insert,
      remove: selection_remove,
      clone: selection_clone,
      datum: selection_datum,
      on: selection_on,
      dispatch: selection_dispatch
    };

    function select(selector) {
      return typeof selector === "string"
          ? new Selection([[document.querySelector(selector)]], [document.documentElement])
          : new Selection([[selector]], root);
    }

    /* eslint-disable no-undefined,no-param-reassign,no-shadow */

    /**
     * Throttle execution of a function. Especially useful for rate limiting
     * execution of handlers on events like resize and scroll.
     *
     * @param  {number}    delay -          A zero-or-greater delay in milliseconds. For event callbacks, values around 100 or 250 (or even higher) are most useful.
     * @param  {boolean}   [noTrailing] -   Optional, defaults to false. If noTrailing is true, callback will only execute every `delay` milliseconds while the
     *                                    throttled-function is being called. If noTrailing is false or unspecified, callback will be executed one final time
     *                                    after the last throttled-function call. (After the throttled-function has not been called for `delay` milliseconds,
     *                                    the internal counter is reset).
     * @param  {Function}  callback -       A function to be executed after delay milliseconds. The `this` context and all arguments are passed through, as-is,
     *                                    to `callback` when the throttled-function is executed.
     * @param  {boolean}   [debounceMode] - If `debounceMode` is true (at begin), schedule `clear` to execute after `delay` ms. If `debounceMode` is false (at end),
     *                                    schedule `callback` to execute after `delay` ms.
     *
     * @returns {Function}  A new, throttled, function.
     */
    function throttle (delay, noTrailing, callback, debounceMode) {
      /*
       * After wrapper has stopped being called, this timeout ensures that
       * `callback` is executed at the proper times in `throttle` and `end`
       * debounce modes.
       */
      var timeoutID;
      var cancelled = false; // Keep track of the last time `callback` was executed.

      var lastExec = 0; // Function to clear existing timeout

      function clearExistingTimeout() {
        if (timeoutID) {
          clearTimeout(timeoutID);
        }
      } // Function to cancel next exec


      function cancel() {
        clearExistingTimeout();
        cancelled = true;
      } // `noTrailing` defaults to falsy.


      if (typeof noTrailing !== 'boolean') {
        debounceMode = callback;
        callback = noTrailing;
        noTrailing = undefined;
      }
      /*
       * The `wrapper` function encapsulates all of the throttling / debouncing
       * functionality and when executed will limit the rate at which `callback`
       * is executed.
       */


      function wrapper() {
        for (var _len = arguments.length, arguments_ = new Array(_len), _key = 0; _key < _len; _key++) {
          arguments_[_key] = arguments[_key];
        }

        var self = this;
        var elapsed = Date.now() - lastExec;

        if (cancelled) {
          return;
        } // Execute `callback` and update the `lastExec` timestamp.


        function exec() {
          lastExec = Date.now();
          callback.apply(self, arguments_);
        }
        /*
         * If `debounceMode` is true (at begin) this is used to clear the flag
         * to allow future `callback` executions.
         */


        function clear() {
          timeoutID = undefined;
        }

        if (debounceMode && !timeoutID) {
          /*
           * Since `wrapper` is being called for the first time and
           * `debounceMode` is true (at begin), execute `callback`.
           */
          exec();
        }

        clearExistingTimeout();

        if (debounceMode === undefined && elapsed > delay) {
          /*
           * In throttle mode, if `delay` time has been exceeded, execute
           * `callback`.
           */
          exec();
        } else if (noTrailing !== true) {
          /*
           * In trailing throttle mode, since `delay` time has not been
           * exceeded, schedule `callback` to execute `delay` ms after most
           * recent execution.
           *
           * If `debounceMode` is true (at begin), schedule `clear` to execute
           * after `delay` ms.
           *
           * If `debounceMode` is false (at end), schedule `callback` to
           * execute after `delay` ms.
           */
          timeoutID = setTimeout(debounceMode ? clear : exec, debounceMode === undefined ? delay - elapsed : delay);
        }
      }

      wrapper.cancel = cancel; // Return the wrapper function.

      return wrapper;
    }

    /**
     * Source: ftp://ftp.unicode.org/Public/UCD/latest/ucd/SpecialCasing.txt
     */
    /**
     * Lower case as a function.
     */
    function lowerCase(str) {
        return str.toLowerCase();
    }

    // Support camel case ("camelCase" -> "camel Case" and "CAMELCase" -> "CAMEL Case").
    var DEFAULT_SPLIT_REGEXP = [/([a-z0-9])([A-Z])/g, /([A-Z])([A-Z][a-z])/g];
    // Remove all non-word characters.
    var DEFAULT_STRIP_REGEXP = /[^A-Z0-9]+/gi;
    /**
     * Normalize the string into something other libraries can manipulate easier.
     */
    function noCase(input, options) {
        if (options === void 0) { options = {}; }
        var _a = options.splitRegexp, splitRegexp = _a === void 0 ? DEFAULT_SPLIT_REGEXP : _a, _b = options.stripRegexp, stripRegexp = _b === void 0 ? DEFAULT_STRIP_REGEXP : _b, _c = options.transform, transform = _c === void 0 ? lowerCase : _c, _d = options.delimiter, delimiter = _d === void 0 ? " " : _d;
        var result = replace(replace(input, splitRegexp, "$1\0$2"), stripRegexp, "\0");
        var start = 0;
        var end = result.length;
        // Trim the delimiter from around the output string.
        while (result.charAt(start) === "\0")
            start++;
        while (result.charAt(end - 1) === "\0")
            end--;
        // Transform each token independently.
        return result.slice(start, end).split("\0").map(transform).join(delimiter);
    }
    /**
     * Replace `re` in the input string with the replacement value.
     */
    function replace(input, re, value) {
        if (re instanceof RegExp)
            return input.replace(re, value);
        return re.reduce(function (input, re) { return input.replace(re, value); }, input);
    }

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */

    var __assign$1 = function() {
        __assign$1 = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign$1.apply(this, arguments);
    };

    function dotCase(input, options) {
        if (options === void 0) { options = {}; }
        return noCase(input, __assign$1({ delimiter: "." }, options));
    }

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */

    var __assign = function() {
        __assign = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign.apply(this, arguments);
    };

    function paramCase(input, options) {
        if (options === void 0) { options = {}; }
        return dotCase(input, __assign({ delimiter: "-" }, options));
    }

    function getStringThickness({ stringWidth, stringIndex }) {
        if (typeof stringWidth === 'number') {
            return stringWidth;
        }
        return stringWidth[stringIndex] || 1;
    }
    function generateStrings({ stringCount, stringWidth, height }) {
        const strings = [];
        let currentStringWidth = 0;
        for (let i = 0; i < stringCount; i++) {
            currentStringWidth = getStringThickness({ stringWidth, stringIndex: i });
            let y = (height / (stringCount - 1)) * i;
            if (i === 0) {
                y += currentStringWidth / 2;
            }
            if (i === stringCount - 1) {
                y -= currentStringWidth / 2;
            }
            strings.push(y);
        }
        return strings;
    }
    function generateFrets({ scaleFrets, fretCount }) {
        const fretRatio = Math.pow(2, 1 / 12);
        const frets = [0];
        for (let i = 1; i <= fretCount; i++) {
            let x = (100 / fretCount) * i;
            if (scaleFrets) {
                x = 100 - 100 / Math.pow(fretRatio, i);
            }
            frets.push(x);
        }
        return frets.map(x => x / frets[frets.length - 1] * 100);
    }
    const accidentalMap = [{
            symbol: '##',
            replacement: 'double-sharp'
        }, {
            symbol: 'bb',
            replacement: 'double-flat'
        }, {
            symbol: '#',
            replacement: 'sharp'
        }, {
            symbol: 'b',
            replacement: 'flat'
        }];
    function valueRenderer(key, value) {
        if (typeof value === 'boolean') {
            return !value ? 'false' : null;
        }
        if (key === 'note') {
            for (let i = 0; i < accidentalMap.length; i++) {
                const { symbol, replacement } = accidentalMap[i];
                if (`${value}`.endsWith(symbol)) {
                    return `${`${value}`[0]}-${replacement}`;
                }
            }
            return `${value}`;
        }
        return `${value}`;
    }
    function classRenderer(prefix, key, value) {
        return [
            'dot',
            prefix,
            paramCase(key),
            valueRenderer(key, value),
        ].filter(x => !!x).join('-');
    }
    function dotClasses(dot, prefix = '') {
        return [
            prefix ? `dot-${prefix}` : null,
            `dot-id-s${dot.string}:f${dot.fret}`,
            ...Object.entries(dot)
                .map(([key, value]) => {
                let valArray;
                if (!(value instanceof Array)) {
                    valArray = [value];
                }
                else {
                    valArray = value;
                }
                return valArray.map(value => classRenderer(prefix, key, value)).join(' ');
            })
        ].filter(x => !!x).join(' ');
    }
    function getDimensions({ topPadding, bottomPadding, leftPadding, rightPadding, width, height, showFretNumbers, fretNumbersHeight }) {
        const totalWidth = width + leftPadding + rightPadding;
        let totalHeight = height + topPadding + bottomPadding;
        if (showFretNumbers) {
            totalHeight += fretNumbersHeight;
        }
        return { totalWidth, totalHeight };
    }
    const getPositionFromMouseCoords = ({ event, stringsGroup, leftPadding, nutWidth, strings, frets, dots }) => {
        const { width: stringsGroupWidth, height: stringsGroupHeight } = stringsGroup.node().getBoundingClientRect();
        const bounds = event.target.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;
        let foundString = 0;
        const stringDistance = stringsGroupHeight / (strings.length - 1);
        for (let i = 0; i < strings.length; i++) {
            if (y < stringDistance * (i + 1)) {
                foundString = i;
                break;
            }
        }
        let foundFret = -1;
        const percentX = (Math.max(0, x - leftPadding) / stringsGroupWidth) * 100;
        for (let i = 0; i < frets.length; i++) {
            if (percentX < frets[i]) {
                foundFret = i;
                break;
            }
            foundFret = i;
        }
        if (x < leftPadding + nutWidth) {
            foundFret = 0;
        }
        const foundDot = dots.find(({ fret, string }) => fret === foundFret && string === foundString + 1);
        return foundDot || {
            string: foundString + 1,
            fret: foundFret
        };
    };
    function createHoverDiv({ bottomPadding, showFretNumbers, fretNumbersHeight }) {
        const hoverDiv = document.createElement('div');
        const bottom = bottomPadding
            + (showFretNumbers ? fretNumbersHeight : 0);
        hoverDiv.className = 'hoverDiv';
        hoverDiv.style.position = 'absolute';
        hoverDiv.style.top = '0';
        hoverDiv.style.bottom = `${bottom}px`;
        hoverDiv.style.left = '0';
        hoverDiv.style.right = '0';
        return hoverDiv;
    }

    function parseChord(chord) {
        const positions = [];
        const mutedStrings = [];
        const splitter = chord.indexOf('-') > -1 ? '-' : '';
        chord.split(splitter).reverse().forEach((fret, string) => {
            if (fret === '0') {
                return;
            }
            if (fret === 'x') {
                mutedStrings.push(string + 1);
                return;
            }
            positions.push({
                fret: +fret,
                string: string + 1
            });
        });
        return {
            positions,
            mutedStrings
        };
    }

    const MIDDLE_FRET = 11;
    const THROTTLE_INTERVAL = 50;
    const DEFAULT_FRET_COUNT = 15;
    const DEFAULT_COLORS = {
        line: '#666',
        highlight: '#ff636c',
        dotStroke: '#555',
        dotFill: 'white',
        fretNumber: '#00000099',
        mutedString: '#333',
        dotText: '#111',
        barres: '#666',
        highlightStroke: 'transparent',
        highlightFill: 'dodgerblue'
    };
    const DEFAULT_DIMENSIONS = {
        width: 960,
        height: 150,
        unit: 20,
        line: 1,
        nut: 7
    };
    const DEFAULT_FONT_FAMILY = 'Arial';
    const DEFAULT_FONT_SIZE = 12;
    const GUITAR_TUNINGS = {
        default: ["E2", "A2", "D3", "G3", "B3", "E4"],
        halfStepDown: ["Eb2", "Ab2", "Db3", "Gb3", "Bb3", "Eb4"],
        dropD: ["D2", "A2", "D3", "G3", "B3", "E4"],
        openG: ["D2", "G2", "D3", "G3", "B3", "D4"],
        DADGAD: ["D2", "A2", "D3", "G3", "A3", "D4"]
    };
    const DEFAULT_HIGHLIGHT_BLEND_MODE = 'color-burn';

    /**
     * Fill a string with a repeated character
     *
     * @param character
     * @param repetition
     */
    const fillStr = (s, n) => Array(Math.abs(n) + 1).join(s);

    function isNamed(src) {
        return src !== null && typeof src === "object" && typeof src.name === "string"
            ? true
            : false;
    }

    function isPitch(pitch) {
        return pitch !== null &&
            typeof pitch === "object" &&
            typeof pitch.step === "number" &&
            typeof pitch.alt === "number"
            ? true
            : false;
    }
    // The number of fifths of [C, D, E, F, G, A, B]
    const FIFTHS = [0, 2, 4, -1, 1, 3, 5];
    // The number of octaves it span each step
    const STEPS_TO_OCTS = FIFTHS.map((fifths) => Math.floor((fifths * 7) / 12));
    function encode(pitch) {
        const { step, alt, oct, dir = 1 } = pitch;
        const f = FIFTHS[step] + 7 * alt;
        if (oct === undefined) {
            return [dir * f];
        }
        const o = oct - STEPS_TO_OCTS[step] - 4 * alt;
        return [dir * f, dir * o];
    }
    // We need to get the steps from fifths
    // Fifths for CDEFGAB are [ 0, 2, 4, -1, 1, 3, 5 ]
    // We add 1 to fifths to avoid negative numbers, so:
    // for ["F", "C", "G", "D", "A", "E", "B"] we have:
    const FIFTHS_TO_STEPS = [3, 0, 4, 1, 5, 2, 6];
    function decode(coord) {
        const [f, o, dir] = coord;
        const step = FIFTHS_TO_STEPS[unaltered(f)];
        const alt = Math.floor((f + 1) / 7);
        if (o === undefined) {
            return { step, alt, dir };
        }
        const oct = o + 4 * alt + STEPS_TO_OCTS[step];
        return { step, alt, oct, dir };
    }
    // Return the number of fifths as if it were unaltered
    function unaltered(f) {
        const i = (f + 1) % 7;
        return i < 0 ? 7 + i : i;
    }

    const NoNote = { empty: true, name: "", pc: "", acc: "" };
    const cache$1 = new Map();
    const stepToLetter = (step) => "CDEFGAB".charAt(step);
    const altToAcc = (alt) => alt < 0 ? fillStr("b", -alt) : fillStr("#", alt);
    const accToAlt = (acc) => acc[0] === "b" ? -acc.length : acc.length;
    /**
     * Given a note literal (a note name or a note object), returns the Note object
     * @example
     * note('Bb4') // => { name: "Bb4", midi: 70, chroma: 10, ... }
     */
    function note(src) {
        const cached = cache$1.get(src);
        if (cached) {
            return cached;
        }
        const value = typeof src === "string"
            ? parse(src)
            : isPitch(src)
                ? note(pitchName(src))
                : isNamed(src)
                    ? note(src.name)
                    : NoNote;
        cache$1.set(src, value);
        return value;
    }
    const REGEX$1 = /^([a-gA-G]?)(#{1,}|b{1,}|x{1,}|)(-?\d*)\s*(.*)$/;
    /**
     * @private
     */
    function tokenizeNote(str) {
        const m = REGEX$1.exec(str);
        return [m[1].toUpperCase(), m[2].replace(/x/g, "##"), m[3], m[4]];
    }
    /**
     * @private
     */
    function coordToNote(noteCoord) {
        return note(decode(noteCoord));
    }
    const mod = (n, m) => ((n % m) + m) % m;
    const SEMI = [0, 2, 4, 5, 7, 9, 11];
    function parse(noteName) {
        const tokens = tokenizeNote(noteName);
        if (tokens[0] === "" || tokens[3] !== "") {
            return NoNote;
        }
        const letter = tokens[0];
        const acc = tokens[1];
        const octStr = tokens[2];
        const step = (letter.charCodeAt(0) + 3) % 7;
        const alt = accToAlt(acc);
        const oct = octStr.length ? +octStr : undefined;
        const coord = encode({ step, alt, oct });
        const name = letter + acc + octStr;
        const pc = letter + acc;
        const chroma = (SEMI[step] + alt + 120) % 12;
        const height = oct === undefined
            ? mod(SEMI[step] + alt, 12) - 12 * 99
            : SEMI[step] + alt + 12 * (oct + 1);
        const midi = height >= 0 && height <= 127 ? height : null;
        const freq = oct === undefined ? null : Math.pow(2, (height - 69) / 12) * 440;
        return {
            empty: false,
            acc,
            alt,
            chroma,
            coord,
            freq,
            height,
            letter,
            midi,
            name,
            oct,
            pc,
            step,
        };
    }
    function pitchName(props) {
        const { step, alt, oct } = props;
        const letter = stepToLetter(step);
        if (!letter) {
            return "";
        }
        const pc = letter + altToAcc(alt);
        return oct || oct === 0 ? pc + oct : pc;
    }

    const NoInterval = { empty: true, name: "", acc: "" };
    // shorthand tonal notation (with quality after number)
    const INTERVAL_TONAL_REGEX = "([-+]?\\d+)(d{1,4}|m|M|P|A{1,4})";
    // standard shorthand notation (with quality before number)
    const INTERVAL_SHORTHAND_REGEX = "(AA|A|P|M|m|d|dd)([-+]?\\d+)";
    const REGEX$1$1 = new RegExp("^" + INTERVAL_TONAL_REGEX + "|" + INTERVAL_SHORTHAND_REGEX + "$");
    /**
     * @private
     */
    function tokenizeInterval(str) {
        const m = REGEX$1$1.exec(`${str}`);
        if (m === null) {
            return ["", ""];
        }
        return m[1] ? [m[1], m[2]] : [m[4], m[3]];
    }
    const cache$1$1 = {};
    /**
     * Get interval properties. It returns an object with:
     *
     * - name: the interval name
     * - num: the interval number
     * - type: 'perfectable' or 'majorable'
     * - q: the interval quality (d, m, M, A)
     * - dir: interval direction (1 ascending, -1 descending)
     * - simple: the simplified number
     * - semitones: the size in semitones
     * - chroma: the interval chroma
     *
     * @param {string} interval - the interval name
     * @return {Object} the interval properties
     *
     * @example
     * import { interval } from '@tonaljs/core'
     * interval('P5').semitones // => 7
     * interval('m3').type // => 'majorable'
     */
    function interval(src) {
        return typeof src === "string"
            ? cache$1$1[src] || (cache$1$1[src] = parse$1(src))
            : isPitch(src)
                ? interval(pitchName$1(src))
                : isNamed(src)
                    ? interval(src.name)
                    : NoInterval;
    }
    const SIZES = [0, 2, 4, 5, 7, 9, 11];
    const TYPES = "PMMPPMM";
    function parse$1(str) {
        const tokens = tokenizeInterval(str);
        if (tokens[0] === "") {
            return NoInterval;
        }
        const num = +tokens[0];
        const q = tokens[1];
        const step = (Math.abs(num) - 1) % 7;
        const t = TYPES[step];
        if (t === "M" && q === "P") {
            return NoInterval;
        }
        const type = t === "M" ? "majorable" : "perfectable";
        const name = "" + num + q;
        const dir = num < 0 ? -1 : 1;
        const simple = num === 8 || num === -8 ? num : dir * (step + 1);
        const alt = qToAlt(type, q);
        const oct = Math.floor((Math.abs(num) - 1) / 7);
        const semitones = dir * (SIZES[step] + alt + 12 * oct);
        const chroma = (((dir * (SIZES[step] + alt)) % 12) + 12) % 12;
        const coord = encode({ step, alt, oct, dir });
        return {
            empty: false,
            name,
            num,
            q,
            step,
            alt,
            dir,
            type,
            simple,
            semitones,
            chroma,
            coord,
            oct,
        };
    }
    /**
     * @private
     */
    function coordToInterval(coord) {
        const [f, o = 0] = coord;
        const isDescending = f * 7 + o * 12 < 0;
        const ivl = isDescending ? [-f, -o, -1] : [f, o, 1];
        return interval(decode(ivl));
    }
    function qToAlt(type, q) {
        return (q === "M" && type === "majorable") ||
            (q === "P" && type === "perfectable")
            ? 0
            : q === "m" && type === "majorable"
                ? -1
                : /^A+$/.test(q)
                    ? q.length
                    : /^d+$/.test(q)
                        ? -1 * (type === "perfectable" ? q.length : q.length + 1)
                        : 0;
    }
    // return the interval name of a pitch
    function pitchName$1(props) {
        const { step, alt, oct = 0, dir } = props;
        if (!dir) {
            return "";
        }
        const num = step + 1 + 7 * oct;
        const d = dir < 0 ? "-" : "";
        const type = TYPES[step] === "M" ? "majorable" : "perfectable";
        const name = d + num + altToQ(type, alt);
        return name;
    }
    function altToQ(type, alt) {
        if (alt === 0) {
            return type === "majorable" ? "M" : "P";
        }
        else if (alt === -1 && type === "majorable") {
            return "m";
        }
        else if (alt > 0) {
            return fillStr("A", alt);
        }
        else {
            return fillStr("d", type === "perfectable" ? alt : alt + 1);
        }
    }

    /**
     * Transpose a note by an interval.
     *
     * @param {string} note - the note or note name
     * @param {string} interval - the interval or interval name
     * @return {string} the transposed note name or empty string if not valid notes
     * @example
     * import { tranpose } from "@tonaljs/core"
     * transpose("d3", "3M") // => "F#3"
     * transpose("D", "3M") // => "F#"
     * ["C", "D", "E", "F", "G"].map(pc => transpose(pc, "M3)) // => ["E", "F#", "G#", "A", "B"]
     */
    function transpose$1(noteName, intervalName) {
        const note$1 = note(noteName);
        const interval$1 = interval(intervalName);
        if (note$1.empty || interval$1.empty) {
            return "";
        }
        const noteCoord = note$1.coord;
        const intervalCoord = interval$1.coord;
        const tr = noteCoord.length === 1
            ? [noteCoord[0] + intervalCoord[0]]
            : [noteCoord[0] + intervalCoord[0], noteCoord[1] + intervalCoord[1]];
        return coordToNote(tr).name;
    }
    /**
     * Find the interval distance between two notes or coord classes.
     *
     * To find distance between coord classes, both notes must be coord classes and
     * the interval is always ascending
     *
     * @param {Note|string} from - the note or note name to calculate distance from
     * @param {Note|string} to - the note or note name to calculate distance to
     * @return {string} the interval name or empty string if not valid notes
     *
     */
    function distance$1(fromNote, toNote) {
        const from = note(fromNote);
        const to = note(toNote);
        if (from.empty || to.empty) {
            return "";
        }
        const fcoord = from.coord;
        const tcoord = to.coord;
        const fifths = tcoord[0] - fcoord[0];
        const octs = fcoord.length === 2 && tcoord.length === 2
            ? tcoord[1] - fcoord[1]
            : -Math.floor((fifths * 7) / 12);
        return coordToInterval([fifths, octs]).name;
    }

    /**
     * Get a note from a note name
     *
     * @function
     * @example
     * Note.get('Bb4') // => { name: "Bb4", midi: 70, chroma: 10, ... }
     */
    const get$5 = note;
    /**
     * Get the note chroma
     * @function
     */
    const chroma = (note) => get$5(note).chroma;
    /**
     * Transpose a note by an interval
     */
    const transpose = transpose$1;

    /**
     * Get properties of an interval
     *
     * @function
     * @example
     * Interval.get('P4') // => {"alt": 0,  "dir": 1,  "name": "4P", "num": 4, "oct": 0, "q": "P", "semitones": 5, "simple": 4, "step": 3, "type": "perfectable"}
     */
    const get$4 = interval;
    /**
     * Get semitones of an interval
     * @function
     * @example
     * Interval.semitones('P4') // => 5
     */
    const semitones = (name) => interval(name).semitones;
    /**
     * Find interval between two notes
     *
     * @example
     * Interval.distance("C4", "G4"); // => "5P"
     */
    const distance = distance$1;

    // ascending range
    /**
     * Rotates a list a number of times. It"s completly agnostic about the
     * contents of the list.
     *
     * @param {Integer} times - the number of rotations
     * @param {Array} collection
     * @return {Array} the rotated collection
     *
     * @example
     * rotate(1, [1, 2, 3]) // => [2, 3, 1]
     */
    function rotate(times, arr) {
        const len = arr.length;
        const n = ((times % len) + len) % len;
        return arr.slice(n, len).concat(arr.slice(0, n));
    }

    const EmptyPcset = {
        empty: true,
        name: "",
        setNum: 0,
        chroma: "000000000000",
        normalized: "000000000000",
        intervals: [],
    };
    // UTILITIES
    const setNumToChroma = (num) => Number(num).toString(2);
    const chromaToNumber = (chroma) => parseInt(chroma, 2);
    const REGEX = /^[01]{12}$/;
    function isChroma(set) {
        return REGEX.test(set);
    }
    const isPcsetNum = (set) => typeof set === "number" && set >= 0 && set <= 4095;
    const isPcset = (set) => set && isChroma(set.chroma);
    const cache = { [EmptyPcset.chroma]: EmptyPcset };
    /**
     * Get the pitch class set of a collection of notes or set number or chroma
     */
    function get$3(src) {
        const chroma = isChroma(src)
            ? src
            : isPcsetNum(src)
                ? setNumToChroma(src)
                : Array.isArray(src)
                    ? listToChroma(src)
                    : isPcset(src)
                        ? src.chroma
                        : EmptyPcset.chroma;
        return (cache[chroma] = cache[chroma] || chromaToPcset(chroma));
    }
    const IVLS = [
        "1P",
        "2m",
        "2M",
        "3m",
        "3M",
        "4P",
        "5d",
        "5P",
        "6m",
        "6M",
        "7m",
        "7M",
    ];
    /**
     * @private
     * Get the intervals of a pcset *starting from C*
     * @param {Set} set - the pitch class set
     * @return {IntervalName[]} an array of interval names or an empty array
     * if not a valid pitch class set
     */
    function chromaToIntervals(chroma) {
        const intervals = [];
        for (let i = 0; i < 12; i++) {
            // tslint:disable-next-line:curly
            if (chroma.charAt(i) === "1")
                intervals.push(IVLS[i]);
        }
        return intervals;
    }
    //// PRIVATE ////
    function chromaRotations(chroma) {
        const binary = chroma.split("");
        return binary.map((_, i) => rotate(i, binary).join(""));
    }
    function chromaToPcset(chroma) {
        const setNum = chromaToNumber(chroma);
        const normalizedNum = chromaRotations(chroma)
            .map(chromaToNumber)
            .filter((n) => n >= 2048)
            .sort()[0];
        const normalized = setNumToChroma(normalizedNum);
        const intervals = chromaToIntervals(chroma);
        return {
            empty: false,
            name: "",
            setNum,
            chroma,
            normalized,
            intervals,
        };
    }
    function listToChroma(set) {
        if (set.length === 0) {
            return EmptyPcset.chroma;
        }
        let pitch;
        const binary = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        // tslint:disable-next-line:prefer-for-of
        for (let i = 0; i < set.length; i++) {
            pitch = note(set[i]);
            // tslint:disable-next-line: curly
            if (pitch.empty)
                pitch = interval(set[i]);
            // tslint:disable-next-line: curly
            if (!pitch.empty)
                binary[pitch.chroma] = 1;
        }
        return binary.join("");
    }

    /**
     * @private
     * Chord List
     * Source: https://en.wikibooks.org/wiki/Music_Theory/Complete_List_of_Chord_Patterns
     * Format: ["intervals", "full name", "abrv1 abrv2"]
     */
    const CHORDS = [
        // ==Major==
        ["1P 3M 5P", "major", "M ^ "],
        ["1P 3M 5P 7M", "major seventh", "maj7 Δ ma7 M7 Maj7 ^7"],
        ["1P 3M 5P 7M 9M", "major ninth", "maj9 Δ9 ^9"],
        ["1P 3M 5P 7M 9M 13M", "major thirteenth", "maj13 Maj13 ^13"],
        ["1P 3M 5P 6M", "sixth", "6 add6 add13 M6"],
        ["1P 3M 5P 6M 9M", "sixth/ninth", "6/9 69 M69"],
        ["1P 3M 6m 7M", "major seventh flat sixth", "M7b6 ^7b6"],
        [
            "1P 3M 5P 7M 11A",
            "major seventh sharp eleventh",
            "maj#4 Δ#4 Δ#11 M7#11 ^7#11 maj7#11",
        ],
        // ==Minor==
        // '''Normal'''
        ["1P 3m 5P", "minor", "m min -"],
        ["1P 3m 5P 7m", "minor seventh", "m7 min7 mi7 -7"],
        [
            "1P 3m 5P 7M",
            "minor/major seventh",
            "m/ma7 m/maj7 mM7 mMaj7 m/M7 -Δ7 mΔ -^7",
        ],
        ["1P 3m 5P 6M", "minor sixth", "m6 -6"],
        ["1P 3m 5P 7m 9M", "minor ninth", "m9 -9"],
        ["1P 3m 5P 7M 9M", "minor/major ninth", "mM9 mMaj9 -^9"],
        ["1P 3m 5P 7m 9M 11P", "minor eleventh", "m11 -11"],
        ["1P 3m 5P 7m 9M 13M", "minor thirteenth", "m13 -13"],
        // '''Diminished'''
        ["1P 3m 5d", "diminished", "dim ° o"],
        ["1P 3m 5d 7d", "diminished seventh", "dim7 °7 o7"],
        ["1P 3m 5d 7m", "half-diminished", "m7b5 ø -7b5 h7 h"],
        // ==Dominant/Seventh==
        // '''Normal'''
        ["1P 3M 5P 7m", "dominant seventh", "7 dom"],
        ["1P 3M 5P 7m 9M", "dominant ninth", "9"],
        ["1P 3M 5P 7m 9M 13M", "dominant thirteenth", "13"],
        ["1P 3M 5P 7m 11A", "lydian dominant seventh", "7#11 7#4"],
        // '''Altered'''
        ["1P 3M 5P 7m 9m", "dominant flat ninth", "7b9"],
        ["1P 3M 5P 7m 9A", "dominant sharp ninth", "7#9"],
        ["1P 3M 7m 9m", "altered", "alt7"],
        // '''Suspended'''
        ["1P 4P 5P", "suspended fourth", "sus4 sus"],
        ["1P 2M 5P", "suspended second", "sus2"],
        ["1P 4P 5P 7m", "suspended fourth seventh", "7sus4 7sus"],
        ["1P 5P 7m 9M 11P", "eleventh", "11"],
        [
            "1P 4P 5P 7m 9m",
            "suspended fourth flat ninth",
            "b9sus phryg 7b9sus 7b9sus4",
        ],
        // ==Other==
        ["1P 5P", "fifth", "5"],
        ["1P 3M 5A", "augmented", "aug + +5 ^#5"],
        ["1P 3m 5A", "minor augmented", "m#5 -#5 m+"],
        ["1P 3M 5A 7M", "augmented seventh", "maj7#5 maj7+5 +maj7 ^7#5"],
        [
            "1P 3M 5P 7M 9M 11A",
            "major sharp eleventh (lydian)",
            "maj9#11 Δ9#11 ^9#11",
        ],
        // ==Legacy==
        ["1P 2M 4P 5P", "", "sus24 sus4add9"],
        ["1P 3M 5A 7M 9M", "", "maj9#5 Maj9#5"],
        ["1P 3M 5A 7m", "", "7#5 +7 7+ 7aug aug7"],
        ["1P 3M 5A 7m 9A", "", "7#5#9 7#9#5 7alt"],
        ["1P 3M 5A 7m 9M", "", "9#5 9+"],
        ["1P 3M 5A 7m 9M 11A", "", "9#5#11"],
        ["1P 3M 5A 7m 9m", "", "7#5b9 7b9#5"],
        ["1P 3M 5A 7m 9m 11A", "", "7#5b9#11"],
        ["1P 3M 5A 9A", "", "+add#9"],
        ["1P 3M 5A 9M", "", "M#5add9 +add9"],
        ["1P 3M 5P 6M 11A", "", "M6#11 M6b5 6#11 6b5"],
        ["1P 3M 5P 6M 7M 9M", "", "M7add13"],
        ["1P 3M 5P 6M 9M 11A", "", "69#11"],
        ["1P 3m 5P 6M 9M", "", "m69 -69"],
        ["1P 3M 5P 6m 7m", "", "7b6"],
        ["1P 3M 5P 7M 9A 11A", "", "maj7#9#11"],
        ["1P 3M 5P 7M 9M 11A 13M", "", "M13#11 maj13#11 M13+4 M13#4"],
        ["1P 3M 5P 7M 9m", "", "M7b9"],
        ["1P 3M 5P 7m 11A 13m", "", "7#11b13 7b5b13"],
        ["1P 3M 5P 7m 13M", "", "7add6 67 7add13"],
        ["1P 3M 5P 7m 9A 11A", "", "7#9#11 7b5#9 7#9b5"],
        ["1P 3M 5P 7m 9A 11A 13M", "", "13#9#11"],
        ["1P 3M 5P 7m 9A 11A 13m", "", "7#9#11b13"],
        ["1P 3M 5P 7m 9A 13M", "", "13#9"],
        ["1P 3M 5P 7m 9A 13m", "", "7#9b13"],
        ["1P 3M 5P 7m 9M 11A", "", "9#11 9+4 9#4"],
        ["1P 3M 5P 7m 9M 11A 13M", "", "13#11 13+4 13#4"],
        ["1P 3M 5P 7m 9M 11A 13m", "", "9#11b13 9b5b13"],
        ["1P 3M 5P 7m 9m 11A", "", "7b9#11 7b5b9 7b9b5"],
        ["1P 3M 5P 7m 9m 11A 13M", "", "13b9#11"],
        ["1P 3M 5P 7m 9m 11A 13m", "", "7b9b13#11 7b9#11b13 7b5b9b13"],
        ["1P 3M 5P 7m 9m 13M", "", "13b9"],
        ["1P 3M 5P 7m 9m 13m", "", "7b9b13"],
        ["1P 3M 5P 7m 9m 9A", "", "7b9#9"],
        ["1P 3M 5P 9M", "", "Madd9 2 add9 add2"],
        ["1P 3M 5P 9m", "", "Maddb9"],
        ["1P 3M 5d", "", "Mb5"],
        ["1P 3M 5d 6M 7m 9M", "", "13b5"],
        ["1P 3M 5d 7M", "", "M7b5"],
        ["1P 3M 5d 7M 9M", "", "M9b5"],
        ["1P 3M 5d 7m", "", "7b5"],
        ["1P 3M 5d 7m 9M", "", "9b5"],
        ["1P 3M 7m", "", "7no5"],
        ["1P 3M 7m 13m", "", "7b13"],
        ["1P 3M 7m 9M", "", "9no5"],
        ["1P 3M 7m 9M 13M", "", "13no5"],
        ["1P 3M 7m 9M 13m", "", "9b13"],
        ["1P 3m 4P 5P", "", "madd4"],
        ["1P 3m 5P 6m 7M", "", "mMaj7b6"],
        ["1P 3m 5P 6m 7M 9M", "", "mMaj9b6"],
        ["1P 3m 5P 7m 11P", "", "m7add11 m7add4"],
        ["1P 3m 5P 9M", "", "madd9"],
        ["1P 3m 5d 6M 7M", "", "o7M7"],
        ["1P 3m 5d 7M", "", "oM7"],
        ["1P 3m 6m 7M", "", "mb6M7"],
        ["1P 3m 6m 7m", "", "m7#5"],
        ["1P 3m 6m 7m 9M", "", "m9#5"],
        ["1P 3m 5A 7m 9M 11P", "", "m11A"],
        ["1P 3m 6m 9m", "", "mb6b9"],
        ["1P 2M 3m 5d 7m", "", "m9b5"],
        ["1P 4P 5A 7M", "", "M7#5sus4"],
        ["1P 4P 5A 7M 9M", "", "M9#5sus4"],
        ["1P 4P 5A 7m", "", "7#5sus4"],
        ["1P 4P 5P 7M", "", "M7sus4"],
        ["1P 4P 5P 7M 9M", "", "M9sus4"],
        ["1P 4P 5P 7m 9M", "", "9sus4 9sus"],
        ["1P 4P 5P 7m 9M 13M", "", "13sus4 13sus"],
        ["1P 4P 5P 7m 9m 13m", "", "7sus4b9b13 7b9b13sus4"],
        ["1P 4P 7m 10m", "", "4 quartal"],
        ["1P 5P 7m 9m 11P", "", "11b9"],
    ];

    ({
        ...EmptyPcset,
        name: "",
        quality: "Unknown",
        intervals: [],
        aliases: [],
    });
    let dictionary = [];
    let index$2 = {};
    /**
     * Add a chord to the dictionary.
     * @param intervals
     * @param aliases
     * @param [fullName]
     */
    function add$1(intervals, aliases, fullName) {
        const quality = getQuality(intervals);
        const chord = {
            ...get$3(intervals),
            name: fullName || "",
            quality,
            intervals,
            aliases,
        };
        dictionary.push(chord);
        if (chord.name) {
            index$2[chord.name] = chord;
        }
        index$2[chord.setNum] = chord;
        index$2[chord.chroma] = chord;
        chord.aliases.forEach((alias) => addAlias$1(chord, alias));
    }
    function addAlias$1(chord, alias) {
        index$2[alias] = chord;
    }
    function getQuality(intervals) {
        const has = (interval) => intervals.indexOf(interval) !== -1;
        return has("5A")
            ? "Augmented"
            : has("3M")
                ? "Major"
                : has("5d")
                    ? "Diminished"
                    : has("3m")
                        ? "Minor"
                        : "Unknown";
    }
    CHORDS.forEach(([ivls, fullName, names]) => add$1(ivls.split(" "), names.split(" "), fullName));
    dictionary.sort((a, b) => a.setNum - b.setNum);

    // SCALES
    // Format: ["intervals", "name", "alias1", "alias2", ...]
    const SCALES = [
        // 5-note scales
        ["1P 2M 3M 5P 6M", "major pentatonic", "pentatonic"],
        ["1P 3M 4P 5P 7M", "ionian pentatonic"],
        ["1P 3M 4P 5P 7m", "mixolydian pentatonic", "indian"],
        ["1P 2M 4P 5P 6M", "ritusen"],
        ["1P 2M 4P 5P 7m", "egyptian"],
        ["1P 3M 4P 5d 7m", "neopolitan major pentatonic"],
        ["1P 3m 4P 5P 6m", "vietnamese 1"],
        ["1P 2m 3m 5P 6m", "pelog"],
        ["1P 2m 4P 5P 6m", "kumoijoshi"],
        ["1P 2M 3m 5P 6m", "hirajoshi"],
        ["1P 2m 4P 5d 7m", "iwato"],
        ["1P 2m 4P 5P 7m", "in-sen"],
        ["1P 3M 4A 5P 7M", "lydian pentatonic", "chinese"],
        ["1P 3m 4P 6m 7m", "malkos raga"],
        ["1P 3m 4P 5d 7m", "locrian pentatonic", "minor seven flat five pentatonic"],
        ["1P 3m 4P 5P 7m", "minor pentatonic", "vietnamese 2"],
        ["1P 3m 4P 5P 6M", "minor six pentatonic"],
        ["1P 2M 3m 5P 6M", "flat three pentatonic", "kumoi"],
        ["1P 2M 3M 5P 6m", "flat six pentatonic"],
        ["1P 2m 3M 5P 6M", "scriabin"],
        ["1P 3M 5d 6m 7m", "whole tone pentatonic"],
        ["1P 3M 4A 5A 7M", "lydian #5P pentatonic"],
        ["1P 3M 4A 5P 7m", "lydian dominant pentatonic"],
        ["1P 3m 4P 5P 7M", "minor #7M pentatonic"],
        ["1P 3m 4d 5d 7m", "super locrian pentatonic"],
        // 6-note scales
        ["1P 2M 3m 4P 5P 7M", "minor hexatonic"],
        ["1P 2A 3M 5P 5A 7M", "augmented"],
        ["1P 2M 3m 3M 5P 6M", "major blues"],
        ["1P 2M 4P 5P 6M 7m", "piongio"],
        ["1P 2m 3M 4A 6M 7m", "prometheus neopolitan"],
        ["1P 2M 3M 4A 6M 7m", "prometheus"],
        ["1P 2m 3M 5d 6m 7m", "mystery #1"],
        ["1P 2m 3M 4P 5A 6M", "six tone symmetric"],
        ["1P 2M 3M 4A 5A 7m", "whole tone", "messiaen's mode #1"],
        ["1P 2m 4P 4A 5P 7M", "messiaen's mode #5"],
        ["1P 3m 4P 5d 5P 7m", "minor blues", "blues"],
        // 7-note scales
        ["1P 2M 3M 4P 5d 6m 7m", "locrian major", "arabian"],
        ["1P 2m 3M 4A 5P 6m 7M", "double harmonic lydian"],
        ["1P 2M 3m 4P 5P 6m 7M", "harmonic minor"],
        [
            "1P 2m 3m 4d 5d 6m 7m",
            "altered",
            "super locrian",
            "diminished whole tone",
            "pomeroy",
        ],
        ["1P 2M 3m 4P 5d 6m 7m", "locrian #2", "half-diminished", "aeolian b5"],
        [
            "1P 2M 3M 4P 5P 6m 7m",
            "mixolydian b6",
            "melodic minor fifth mode",
            "hindu",
        ],
        ["1P 2M 3M 4A 5P 6M 7m", "lydian dominant", "lydian b7", "overtone"],
        ["1P 2M 3M 4A 5P 6M 7M", "lydian"],
        ["1P 2M 3M 4A 5A 6M 7M", "lydian augmented"],
        [
            "1P 2m 3m 4P 5P 6M 7m",
            "dorian b2",
            "phrygian #6",
            "melodic minor second mode",
        ],
        ["1P 2M 3m 4P 5P 6M 7M", "melodic minor"],
        ["1P 2m 3m 4P 5d 6m 7m", "locrian"],
        [
            "1P 2m 3m 4d 5d 6m 7d",
            "ultralocrian",
            "superlocrian bb7",
            "·superlocrian diminished",
        ],
        ["1P 2m 3m 4P 5d 6M 7m", "locrian 6", "locrian natural 6", "locrian sharp 6"],
        ["1P 2A 3M 4P 5P 5A 7M", "augmented heptatonic"],
        ["1P 2M 3m 5d 5P 6M 7m", "romanian minor"],
        ["1P 2M 3m 4A 5P 6M 7m", "dorian #4"],
        ["1P 2M 3m 4A 5P 6M 7M", "lydian diminished"],
        ["1P 2m 3m 4P 5P 6m 7m", "phrygian"],
        ["1P 2M 3M 4A 5A 7m 7M", "leading whole tone"],
        ["1P 2M 3M 4A 5P 6m 7m", "lydian minor"],
        ["1P 2m 3M 4P 5P 6m 7m", "phrygian dominant", "spanish", "phrygian major"],
        ["1P 2m 3m 4P 5P 6m 7M", "balinese"],
        ["1P 2m 3m 4P 5P 6M 7M", "neopolitan major"],
        ["1P 2M 3m 4P 5P 6m 7m", "aeolian", "minor"],
        ["1P 2M 3M 4P 5P 6m 7M", "harmonic major"],
        ["1P 2m 3M 4P 5P 6m 7M", "double harmonic major", "gypsy"],
        ["1P 2M 3m 4P 5P 6M 7m", "dorian"],
        ["1P 2M 3m 4A 5P 6m 7M", "hungarian minor"],
        ["1P 2A 3M 4A 5P 6M 7m", "hungarian major"],
        ["1P 2m 3M 4P 5d 6M 7m", "oriental"],
        ["1P 2m 3m 3M 4A 5P 7m", "flamenco"],
        ["1P 2m 3m 4A 5P 6m 7M", "todi raga"],
        ["1P 2M 3M 4P 5P 6M 7m", "mixolydian", "dominant"],
        ["1P 2m 3M 4P 5d 6m 7M", "persian"],
        ["1P 2M 3M 4P 5P 6M 7M", "major", "ionian"],
        ["1P 2m 3M 5d 6m 7m 7M", "enigmatic"],
        [
            "1P 2M 3M 4P 5A 6M 7M",
            "major augmented",
            "major #5",
            "ionian augmented",
            "ionian #5",
        ],
        ["1P 2A 3M 4A 5P 6M 7M", "lydian #9"],
        // 8-note scales
        ["1P 2m 2M 4P 4A 5P 6m 7M", "messiaen's mode #4"],
        ["1P 2m 3M 4P 4A 5P 6m 7M", "purvi raga"],
        ["1P 2m 3m 3M 4P 5P 6m 7m", "spanish heptatonic"],
        ["1P 2M 3M 4P 5P 6M 7m 7M", "bebop"],
        ["1P 2M 3m 3M 4P 5P 6M 7m", "bebop minor"],
        ["1P 2M 3M 4P 5P 5A 6M 7M", "bebop major"],
        ["1P 2m 3m 4P 5d 5P 6m 7m", "bebop locrian"],
        ["1P 2M 3m 4P 5P 6m 7m 7M", "minor bebop"],
        ["1P 2M 3m 4P 5d 6m 6M 7M", "diminished", "whole-half diminished"],
        ["1P 2M 3M 4P 5d 5P 6M 7M", "ichikosucho"],
        ["1P 2M 3m 4P 5P 6m 6M 7M", "minor six diminished"],
        [
            "1P 2m 3m 3M 4A 5P 6M 7m",
            "half-whole diminished",
            "dominant diminished",
            "messiaen's mode #2",
        ],
        ["1P 3m 3M 4P 5P 6M 7m 7M", "kafi raga"],
        ["1P 2M 3M 4P 4A 5A 6A 7M", "messiaen's mode #6"],
        // 9-note scales
        ["1P 2M 3m 3M 4P 5d 5P 6M 7m", "composite blues"],
        ["1P 2M 3m 3M 4A 5P 6m 7m 7M", "messiaen's mode #3"],
        // 10-note scales
        ["1P 2m 2M 3m 4P 4A 5P 6m 6M 7M", "messiaen's mode #7"],
        // 12-note scales
        ["1P 2m 2M 3m 3M 4P 5d 5P 6m 6M 7m 7M", "chromatic"],
    ];

    const NoScaleType = {
        ...EmptyPcset,
        intervals: [],
        aliases: [],
    };
    let index$1 = {};
    /**
     * Given a scale name or chroma, return the scale properties
     *
     * @param {string} type - scale name or pitch class set chroma
     * @example
     * import { get } from 'tonaljs/scale-type'
     * get('major') // => { name: 'major', ... }
     */
    function get$2(type) {
        return index$1[type] || NoScaleType;
    }
    /**
     * Add a scale into dictionary
     * @param intervals
     * @param name
     * @param aliases
     */
    function add(intervals, name, aliases = []) {
        const scale = { ...get$3(intervals), name, intervals, aliases };
        index$1[scale.name] = scale;
        index$1[scale.setNum] = scale;
        index$1[scale.chroma] = scale;
        scale.aliases.forEach((alias) => addAlias(scale, alias));
        return scale;
    }
    function addAlias(scale, alias) {
        index$1[alias] = scale;
    }
    SCALES.forEach(([ivls, name, ...aliases]) => add(ivls.split(" "), name, aliases));

    /**
     * References:
     * - https://www.researchgate.net/publication/327567188_An_Algorithm_for_Spelling_the_Pitches_of_Any_Musical_Scale
     * @module scale
     */
    const NoScale = {
        empty: true,
        name: "",
        type: "",
        tonic: null,
        setNum: NaN,
        chroma: "",
        normalized: "",
        aliases: [],
        notes: [],
        intervals: [],
    };
    /**
     * Given a string with a scale name and (optionally) a tonic, split
     * that components.
     *
     * It retuns an array with the form [ name, tonic ] where tonic can be a
     * note name or null and name can be any arbitrary string
     * (this function doesn"t check if that scale name exists)
     *
     * @function
     * @param {string} name - the scale name
     * @return {Array} an array [tonic, name]
     * @example
     * tokenize("C mixolydean") // => ["C", "mixolydean"]
     * tokenize("anything is valid") // => ["", "anything is valid"]
     * tokenize() // => ["", ""]
     */
    function tokenize(name) {
        if (typeof name !== "string") {
            return ["", ""];
        }
        const i = name.indexOf(" ");
        const tonic = note(name.substring(0, i));
        if (tonic.empty) {
            const n = note(name);
            return n.empty ? ["", name] : [n.name, ""];
        }
        const type = name.substring(tonic.name.length + 1);
        return [tonic.name, type.length ? type : ""];
    }
    /**
     * Get a Scale from a scale name.
     */
    function get$1(src) {
        const tokens = Array.isArray(src) ? src : tokenize(src);
        const tonic = note(tokens[0]).name;
        const st = get$2(tokens[1]);
        if (st.empty) {
            return NoScale;
        }
        const type = st.name;
        const notes = tonic
            ? st.intervals.map((i) => transpose$1(tonic, i))
            : [];
        const name = tonic ? tonic + " " + type : type;
        return { ...st, name, type, tonic, notes };
    }

    const MODES = [
        [0, 2773, 0, "ionian", "", "Maj7", "major"],
        [1, 2902, 2, "dorian", "m", "m7"],
        [2, 3418, 4, "phrygian", "m", "m7"],
        [3, 2741, -1, "lydian", "", "Maj7"],
        [4, 2774, 1, "mixolydian", "", "7"],
        [5, 2906, 3, "aeolian", "m", "m7", "minor"],
        [6, 3434, 5, "locrian", "dim", "m7b5"],
    ];
    const NoMode = {
        ...EmptyPcset,
        name: "",
        alt: 0,
        modeNum: NaN,
        triad: "",
        seventh: "",
        aliases: [],
    };
    const modes = MODES.map(toMode);
    const index = {};
    modes.forEach((mode) => {
        index[mode.name] = mode;
        mode.aliases.forEach((alias) => {
            index[alias] = mode;
        });
    });
    /**
     * Get a Mode by it's name
     *
     * @example
     * get('dorian')
     * // =>
     * // {
     * //   intervals: [ '1P', '2M', '3m', '4P', '5P', '6M', '7m' ],
     * //   modeNum: 1,
     * //   chroma: '101101010110',
     * //   normalized: '101101010110',
     * //   name: 'dorian',
     * //   setNum: 2902,
     * //   alt: 2,
     * //   triad: 'm',
     * //   seventh: 'm7',
     * //   aliases: []
     * // }
     */
    function get(name) {
        return typeof name === "string"
            ? index[name.toLowerCase()] || NoMode
            : name && name.name
                ? get(name.name)
                : NoMode;
    }
    function toMode(mode) {
        const [modeNum, setNum, alt, name, triad, seventh, alias] = mode;
        const aliases = alias ? [alias] : [];
        const chroma = Number(setNum).toString(2);
        const intervals = chromaToIntervals(chroma);
        return {
            empty: false,
            intervals,
            modeNum,
            chroma,
            normalized: chroma,
            name,
            setNum,
            alt,
            triad,
            seventh,
            aliases,
        };
    }
    function chords(chords) {
        return (modeName, tonic) => {
            const mode = get(modeName);
            if (mode.empty)
                return [];
            const triads = rotate(mode.modeNum, chords);
            const tonics = mode.intervals.map((i) => transpose$1(tonic, i));
            return triads.map((triad, i) => tonics[i] + triad);
        };
    }
    chords(MODES.map((x) => x[4]));
    chords(MODES.map((x) => x[5]));

    exports.Systems = void 0;
    (function (Systems) {
        Systems["pentatonic"] = "pentatonic";
        Systems["CAGED"] = "CAGED";
        Systems["TNPS"] = "TNPS";
    })(exports.Systems || (exports.Systems = {}));
    const DEFAULT_MODE = 0;
    const DEFAULT_PENTATONIC_MODE = 5;
    const CAGED_ORDER = 'GEDCA';
    const CAGEDDefinition = [
        {
            box: [
                '-6-71',
                '-34-5',
                '71-2-',
                '-5-6-',
                '-2-34',
                '-6-71'
            ],
            baseChroma: chroma('G#'),
            baseOctave: 2
        },
        {
            box: [
                '71-2',
                '-5-6',
                '2-34',
                '6-71',
                '34-5',
                '71-2'
            ],
            baseChroma: chroma('E#'),
            baseOctave: 2
        },
        {
            box: [
                '-2-34',
                '-6-71',
                '34-5',
                '71-2-',
                '-5-6-',
                '-2-34'
            ],
            baseChroma: chroma('D#'),
            baseOctave: 3
        },
        {
            box: [
                '34-5',
                '71-2',
                '5-6-',
                '2-34',
                '6-71',
                '34-5'
            ],
            baseChroma: chroma('C'),
            baseOctave: 3
        },
        {
            box: [
                '-5-6-',
                '-2-34',
                '6-71-',
                '34-5-',
                '71-2-',
                '-5-6-'
            ],
            baseChroma: chroma('A#'),
            baseOctave: 2
        }
    ];
    const TNPSDefinition = [
        {
            box: [
                '--2-34',
                '--6-71',
                '-34-5-',
                '-71-2-',
                '4-5-6-',
                '1-2-3-'
            ],
            baseChroma: chroma('E'),
            baseOctave: 2
        },
        {
            box: [
                '--34-5',
                '--71-2',
                '4-5-6-',
                '1-2-3-',
                '5-6-7-',
                '2-34--'
            ],
            baseChroma: chroma('D'),
            baseOctave: 3
        },
        {
            box: [
                '-4-5-6',
                '-1-2-3',
                '5-6-7-',
                '2-34--',
                '6-71--',
                '34-5--'
            ],
            baseChroma: chroma('C'),
            baseOctave: 3
        },
        {
            box: [
                '--5-6-7',
                '--2-34-',
                '-6-71--',
                '-34-5--',
                '-71-2--',
                '4-5-6--'
            ],
            baseChroma: chroma('B'),
            baseOctave: 2
        },
        {
            box: [
                '--6-71',
                '--34-5',
                '-71-2-',
                '4-5-6-',
                '1-2-3-',
                '5-6-7-'
            ],
            baseChroma: chroma('A'),
            baseOctave: 2
        },
        {
            box: [
                '--71-2',
                '-4-5-6',
                '1-2-3-',
                '5-6-7-',
                '2-34--',
                '6-71--'
            ],
            baseChroma: chroma('G'),
            baseOctave: 2
        },
        {
            box: [
                '-1-2-3',
                '-5-6-7',
                '2-34--',
                '6-71--',
                '34-5--',
                '71-2--'
            ],
            baseChroma: chroma('F'),
            baseOctave: 2
        }
    ];
    function getModeFromScaleType(type) {
        const { modeNum } = get(type.replace('pentatonic', '').trim());
        return modeNum;
    }
    function getModeOffset(mode) {
        return chroma('CDEFGAB'.split('')[mode]);
    }
    function getPentatonicBoxIndex(box, mode) {
        if (mode === DEFAULT_PENTATONIC_MODE) {
            return box - 1;
        }
        return box % 5;
    }
    function getBoxPositions({ root, box, modeOffset = 0, baseChroma }) {
        let delta = chroma(root) - baseChroma - modeOffset;
        while (delta < -1) {
            delta += 12;
        }
        return box.reduce((memo, item, string) => ([
            ...memo,
            ...item.split('').map((x, i) => x !== '-'
                ? { string: string + 1, fret: i + delta }
                : null).filter(x => !!x)
        ]), []);
    }
    function getBox({ root, mode = -1, system, box }) {
        let foundBox;
        let modeNumber = system === exports.Systems.pentatonic
            ? DEFAULT_PENTATONIC_MODE
            : DEFAULT_MODE;
        if (typeof mode === 'string') {
            modeNumber = getModeFromScaleType(mode);
        }
        else if (mode > -1) {
            modeNumber = mode;
        }
        switch (system) {
            case exports.Systems.pentatonic:
                foundBox = CAGEDDefinition[getPentatonicBoxIndex(+box, modeNumber)];
                break;
            case exports.Systems.CAGED:
                foundBox = CAGEDDefinition[CAGED_ORDER.indexOf(`${box}`)];
                break;
            case exports.Systems.TNPS:
                foundBox = TNPSDefinition[+box - 1];
                break;
        }
        if (!foundBox) {
            throw new Error(`Cannot find box ${box} in the ${exports.Systems[system]} scale system`);
        }
        const { baseChroma, box: boxDefinition } = foundBox;
        return getBoxPositions({
            root,
            modeOffset: getModeOffset(modeNumber),
            baseChroma,
            box: system === exports.Systems.pentatonic
                ? boxDefinition.slice().map(x => x.replace('4', '-').replace('7', '-'))
                : boxDefinition
        });
    }

    const CHROMATIC_SCALE = get$1('C chromatic').notes;
    function parseNote(note) {
        let octave = +note.slice(-1);
        let parsedNote = note;
        if (isNaN(octave)) {
            octave = 2;
        }
        else {
            parsedNote = note.slice(0, -1);
        }
        return {
            octave,
            note: parsedNote
        };
    }
    function getOctaveInScale({ root, note, octave, baseOctave }) {
        const noteChroma = chroma(note) || 0;
        const rootChroma = chroma(root) || 0;
        if (rootChroma > noteChroma) {
            return octave - 1 - baseOctave;
        }
        return octave - baseOctave;
    }
    function isPositionInBox({ fret, string }, systemPositions) {
        return !!systemPositions.find(x => x.fret === fret && x.string === string);
    }
    class FretboardSystem {
        constructor(params) {
            this.tuning = GUITAR_TUNINGS.default;
            this.fretCount = DEFAULT_FRET_COUNT;
            Object.assign(this, params);
            const { note: baseNote, octave: baseOctave } = parseNote(this.tuning[0]);
            this.baseNote = baseNote;
            this.baseOctave = baseOctave;
            this.populate();
        }
        getTuning() {
            return this.tuning;
        }
        getFretCount() {
            return this.fretCount;
        }
        getNoteAtPosition(position) {
            const { chroma } = this.positions.find(x => x.string === position.string && x.fret === position.fret);
            const note = CHROMATIC_SCALE[chroma];
            const octave = this.getOctave(Object.assign(Object.assign({}, position), { chroma,
                note }));
            return { chroma, note, octave };
        }
        getScale({ type = 'major', root: paramsRoot = 'C', box }) {
            const { baseOctave } = this;
            const { note: root } = parseNote(paramsRoot);
            const scaleName = `${root} ${type}`;
            const { notes, empty, intervals } = get$1(scaleName);
            if (empty) {
                throw new Error(`Cannot find scale: ${scaleName}`);
            }
            const mode = getModeFromScaleType(type);
            const boxPositions = box ? this.adjustOctave(getBox(Object.assign({ root, mode }, box)), paramsRoot) : [];
            const reverseMap = notes.map((note, index) => ({
                chroma: chroma(note),
                note,
                interval: intervals[index],
                degree: +intervals[index][0]
            }));
            return this.positions
                .filter(({ chroma }) => reverseMap.find(x => x.chroma === chroma))
                .map((_a) => {
                var { chroma } = _a, rest = __rest(_a, ["chroma"]);
                return (Object.assign(Object.assign({}, reverseMap.find(x => x.chroma === chroma)), rest));
            })
                .map(x => {
                const octave = this.getOctave(x);
                const position = Object.assign({ octave, octaveInScale: getOctaveInScale(Object.assign({ root, octave, baseOctave }, x)) }, x);
                if (boxPositions.length && isPositionInBox(x, boxPositions)) {
                    position.inBox = true;
                }
                return position;
            });
        }
        adjustOctave(positions, root) {
            const { tuning } = this;
            const rootOffset = semitones(distance(tuning[0], root)) >= 12;
            const negativeFrets = positions.filter(x => x.fret < 0).length > 0;
            return positions.map(({ string, fret }) => ({
                string,
                fret: rootOffset || negativeFrets ? fret + 12 : fret
            }));
        }
        populate() {
            const { tuning, fretCount } = this;
            this.positions = tuning
                .slice().reverse()
                .reduce((memo, note, index) => {
                const string = index + 1;
                const { chroma } = get$5(note);
                const filledString = Array.from({ length: fretCount + 1 }, (_, fret) => ({
                    string,
                    fret,
                    chroma: (chroma + fret) % 12
                }));
                return [...memo, ...filledString];
            }, []);
        }
        getOctave({ fret, string, chroma: chroma$1, note }) {
            const { tuning } = this;
            const baseNoteWithOctave = tuning[tuning.length - string];
            const { note: baseNote, octave: baseOctave } = parseNote(baseNoteWithOctave);
            const baseChroma = chroma(baseNote);
            let octaveIncrement = chroma$1 < baseChroma ? 1 : 0;
            if (note === 'B#' && octaveIncrement > 0) {
                octaveIncrement--;
            }
            else if (note === 'Cb' && octaveIncrement === 0) {
                octaveIncrement++;
            }
            octaveIncrement += Math.floor(fret / 12);
            return baseOctave + octaveIncrement;
        }
    }

    const defaultOptions = {
        el: '#fretboard',
        tuning: GUITAR_TUNINGS.default,
        stringCount: 6,
        stringWidth: DEFAULT_DIMENSIONS.line,
        stringColor: DEFAULT_COLORS.line,
        fretCount: DEFAULT_FRET_COUNT,
        fretWidth: DEFAULT_DIMENSIONS.line,
        fretColor: DEFAULT_COLORS.line,
        nutWidth: DEFAULT_DIMENSIONS.nut,
        nutColor: DEFAULT_COLORS.line,
        middleFretColor: DEFAULT_COLORS.highlight,
        middleFretWidth: 3 * DEFAULT_DIMENSIONS.line,
        scaleFrets: true,
        crop: false,
        fretLeftPadding: 0,
        topPadding: DEFAULT_DIMENSIONS.unit,
        bottomPadding: DEFAULT_DIMENSIONS.unit * .75,
        leftPadding: DEFAULT_DIMENSIONS.unit,
        rightPadding: DEFAULT_DIMENSIONS.unit,
        height: DEFAULT_DIMENSIONS.height,
        width: DEFAULT_DIMENSIONS.width,
        dotSize: DEFAULT_DIMENSIONS.unit,
        dotStrokeColor: DEFAULT_COLORS.dotStroke,
        dotStrokeWidth: 2 * DEFAULT_DIMENSIONS.line,
        dotTextSize: DEFAULT_FONT_SIZE,
        dotFill: DEFAULT_COLORS.dotFill,
        dotText: () => '',
        disabledOpacity: 0.9,
        showFretNumbers: true,
        fretNumbersHeight: 2 * DEFAULT_DIMENSIONS.unit,
        fretNumbersMargin: DEFAULT_DIMENSIONS.unit,
        fretNumbersColor: DEFAULT_COLORS.line,
        font: DEFAULT_FONT_FAMILY,
        barresColor: DEFAULT_COLORS.barres,
        highlightPadding: DEFAULT_DIMENSIONS.unit * .5,
        highlightRadius: DEFAULT_DIMENSIONS.unit * .5,
        highlightStroke: DEFAULT_COLORS.highlightStroke,
        highlightFill: DEFAULT_COLORS.highlightFill,
        highlightBlendMode: DEFAULT_HIGHLIGHT_BLEND_MODE
    };
    const defaultMuteStringsParams = {
        strings: [],
        width: 15,
        strokeWidth: 5,
        stroke: DEFAULT_COLORS.mutedString
    };
    function getDotCoords({ fret, string, frets, strings }) {
        let x = 0;
        if (fret === 0) {
            x = frets[0] / 2;
        }
        else {
            x = frets[fret] - (frets[fret] - frets[fret - 1]) / 2;
        }
        return { x, y: strings[string - 1] };
    }
    function generatePositions({ fretCount, stringCount, frets, strings }) {
        const positions = [];
        for (let string = 1; string <= stringCount; string++) {
            const currentString = [];
            for (let fret = 0; fret <= fretCount; fret++) {
                currentString.push(getDotCoords({ fret, string, frets, strings }));
            }
            positions.push(currentString);
        }
        return positions;
    }
    function validateOptions(options) {
        const { stringCount, tuning } = options;
        if (stringCount !== tuning.length) {
            throw new Error(`stringCount (${stringCount}) and tuning size (${tuning.length}) do not match`);
        }
    }
    function getBounds(area) {
        const getMinMax = (what) => [
            Math.min(...area.map(x => x[what])),
            Math.max(...area.map(x => x[what])),
        ];
        const [minString, maxString] = getMinMax('string');
        const [minFret, maxFret] = getMinMax('fret');
        return {
            bottomLeft: { string: maxString, fret: minFret },
            bottomRight: { string: maxString, fret: maxFret },
            topRight: { string: minString, fret: maxFret },
            topLeft: { string: minString, fret: minFret }
        };
    }
    class Fretboard {
        constructor(options = {}) {
            this.handlers = {};
            this.dots = [];
            this.options = Object.assign({}, defaultOptions, options);
            validateOptions(this.options);
            const { el, height, width, leftPadding, topPadding, stringCount, stringWidth, fretCount, scaleFrets, tuning } = this.options;
            this.strings = generateStrings({ stringCount, height, stringWidth });
            this.frets = generateFrets({ fretCount, scaleFrets });
            const { totalWidth, totalHeight } = getDimensions(this.options);
            this.system = new FretboardSystem({
                fretCount,
                tuning
            });
            this.positions = generatePositions(Object.assign(Object.assign({}, this), this.options));
            this.svg = (typeof el === 'string'
                ? select(el)
                : select(el))
                .append('div')
                .attr('class', 'fretboard-html-wrapper')
                .attr('style', 'position: relative')
                .append('svg')
                .attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
            this.wrapper = this.svg
                .append('g')
                .attr('class', 'fretboard-wrapper')
                .attr('transform', `translate(${leftPadding}, ${topPadding}) scale(${width / totalWidth})`);
        }
        render() {
            const { wrapper, positions, options } = this;
            const { font, dotStrokeColor, dotStrokeWidth, dotFill, dotSize, dotText, dotTextSize, disabledOpacity } = this.options;
            const dotOffset = this.getDotOffset();
            this.baseRender(dotOffset);
            wrapper.select('.dots').remove();
            const dots = this.dots.filter(dot => dot.fret <= options.fretCount + dotOffset);
            if (!dots.length) {
                return this;
            }
            const dotGroup = wrapper
                .append('g')
                .attr('class', 'dots')
                .attr('font-family', font);
            const dotsNodes = dotGroup.selectAll('g')
                .data(dots)
                .enter()
                .filter(({ fret }) => fret >= 0)
                .append('g')
                .attr('class', dot => ['dot', dotClasses(dot, '')].join(' '))
                .attr('opacity', ({ disabled }) => disabled ? disabledOpacity : 1);
            dotsNodes.append('circle')
                .attr('class', 'dot-circle')
                .attr('cx', ({ string, fret }) => `${positions[string - 1][fret - dotOffset].x}%`)
                .attr('cy', ({ string, fret }) => positions[string - 1][fret - dotOffset].y)
                .attr('r', dotSize * 0.5)
                .attr('stroke', dotStrokeColor)
                .attr('stroke-width', dotStrokeWidth)
                .attr('fill', dotFill);
            dotsNodes.append('text')
                .attr('class', 'dot-text')
                .attr('x', ({ string, fret }) => `${positions[string - 1][fret - dotOffset].x}%`)
                .attr('y', ({ string, fret }) => positions[string - 1][fret - dotOffset].y)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'central')
                .attr('font-size', dotTextSize)
                .text(dotText);
            return this;
        }
        setDots(dots) {
            this.dots = dots;
            return this;
        }
        clear() {
            this.setDots([]);
            this.wrapper.select('.dots').remove();
            return this;
        }
        style(_a) {
            var { filter = () => true, text, fontSize, fontFill } = _a, opts = __rest(_a, ["filter", "text", "fontSize", "fontFill"]);
            const { wrapper } = this;
            const { dotTextSize } = this.options;
            const filterFunction = filter instanceof Function
                ? filter
                : (dot) => {
                    const [key, value] = Object.entries(filter)[0];
                    return dot[key] === value;
                };
            const dots = wrapper.selectAll('.dot-circle')
                .filter(filterFunction);
            Object.keys(opts).forEach(key => dots.attr(key, opts[key]));
            if (text) {
                wrapper.selectAll('.dot-text')
                    .filter(filterFunction)
                    .text(text)
                    .attr('font-size', fontSize || dotTextSize)
                    .attr('fill', fontFill || DEFAULT_COLORS.dotText);
            }
            return this;
        }
        muteStrings(params) {
            const { wrapper, positions } = this;
            const { strings, stroke, strokeWidth, width } = Object.assign(Object.assign({}, defaultMuteStringsParams), params);
            wrapper
                .append('g')
                .attr('class', 'muted-strings')
                .attr('transform', `translate(${-width / 2}, ${-width / 2})`)
                .selectAll('path')
                .data(strings)
                .enter()
                .append('path')
                .attr('d', d => {
                const { y } = positions[d - 1][0];
                return [
                    `M 0 ${y}`,
                    `L ${width} ${y + width}`,
                    `M ${width} ${y}`,
                    `L 0 ${y + width}`
                ].join(' ');
            })
                .attr('stroke', stroke)
                .attr('stroke-width', strokeWidth)
                .attr('class', 'muted-string');
            return this;
        }
        renderChord(chord, barres) {
            const { positions, mutedStrings: strings } = parseChord(chord);
            this.setDots(positions);
            if (barres) {
                this.renderBarres([].concat(barres));
            }
            this.render();
            this.muteStrings({ strings });
            return this;
        }
        renderScale({ type, root, box }) {
            if (box && this.options.tuning.toString() !== GUITAR_TUNINGS.default.toString()) {
                console.warn('Selected scale system works for standard tuning. Wrong notes may be highlighted.');
            }
            const dots = this.system.getScale({ type, root, box });
            return this.setDots(dots).render();
        }
        renderBox({ type, root, box }) {
            if (this.options.tuning.toString() !== GUITAR_TUNINGS.default.toString()) {
                console.warn('Selected scale system works for standard tuning. Wrong notes may be highlighted.');
            }
            const dots = this.system.getScale({ type, root, box }).filter(({ inBox }) => inBox);
            return this.setDots(dots).render();
        }
        highlightAreas(...areas) {
            const { wrapper, options, positions } = this;
            const { width, dotSize, highlightPadding, highlightFill, highlightStroke, highlightBlendMode, highlightRadius } = options;
            const highlightGroup = wrapper
                .append('g')
                .attr('class', 'highlight-areas');
            const dotPercentSize = dotSize / width * 100;
            const highlightPaddingPercentSize = highlightPadding / width * 100;
            const dotOffset = this.getDotOffset();
            const bounds = areas.map(getBounds);
            highlightGroup
                .selectAll('rect')
                .data(bounds)
                .enter()
                .append('rect')
                .attr('class', 'area')
                .attr('y', ({ topLeft }) => positions[topLeft.string - 1][topLeft.fret - dotOffset].y - dotSize * 0.5 - highlightPadding)
                .attr('x', ({ topLeft }) => `${positions[topLeft.string - 1][topLeft.fret - dotOffset].x - dotPercentSize / 2 - highlightPaddingPercentSize}%`)
                .attr('rx', highlightRadius)
                .attr('width', ({ topLeft, topRight }) => {
                const from = positions[topLeft.string - 1][topLeft.fret].x;
                const to = positions[topRight.string - 1][topRight.fret].x;
                return `${to - from + dotPercentSize + 2 * highlightPaddingPercentSize}%`;
            })
                .attr('height', ({ topLeft, bottomLeft }) => {
                const from = positions[topLeft.string - 1][topLeft.fret].y;
                const to = positions[bottomLeft.string - 1][bottomLeft.fret].y;
                return to - from + dotSize + 2 * highlightPadding;
            })
                .attr('stroke', highlightStroke)
                .attr('fill', highlightFill)
                .attr('style', `mix-blend-mode: ${highlightBlendMode}`);
            return this;
        }
        clearHighlightAreas() {
            this.wrapper.select('.highlight-areas').remove();
            return this;
        }
        on(eventName, handler) {
            const { svg, options, strings, frets, hoverDiv, dots, system } = this;
            const stringsGroup = svg.select('.strings');
            if (!hoverDiv) {
                this.hoverDiv = createHoverDiv(options);
                svg.node().parentNode.appendChild(this.hoverDiv);
            }
            if (this.handlers[eventName]) {
                this.hoverDiv.removeEventListener(eventName, this.handlers[eventName]);
            }
            this.handlers[eventName] = throttle(THROTTLE_INTERVAL, (event) => {
                const position = getPositionFromMouseCoords(Object.assign({ event,
                    stringsGroup,
                    strings,
                    frets,
                    dots }, options));
                const { note, chroma } = system.getNoteAtPosition(position);
                handler(Object.assign(Object.assign({}, position), { note, chroma }), event);
            });
            this.hoverDiv.addEventListener(eventName, this.handlers[eventName]);
            return this;
        }
        removeEventListeners() {
            const { hoverDiv, handlers } = this;
            if (!hoverDiv) {
                return this;
            }
            Object
                .entries(handlers)
                .map(([eventName, handler]) => hoverDiv.removeEventListener(eventName, handler));
            return this;
        }
        renderBarres(barres) {
            const { wrapper, strings, options, positions } = this;
            const normalisedBarres = barres.map(({ fret, stringFrom, stringTo }) => ({
                fret,
                stringFrom: stringFrom
                    ? Math.min(stringFrom, strings.length)
                    : strings.length,
                stringTo: stringTo
                    ? Math.max(stringTo, 1)
                    : 1
            }));
            const { dotSize, barresColor } = options;
            const dotOffset = this.getDotOffset();
            const barreWidth = dotSize * .8;
            const barresGroup = wrapper
                .append('g')
                .attr('class', 'barres')
                .attr('transform', `translate(-${barreWidth * .5}, 0)`);
            barresGroup
                .selectAll('rect')
                .data(normalisedBarres)
                .enter()
                .append('rect')
                .attr('y', ({ fret, stringTo }) => positions[stringTo - 1][fret - dotOffset].y - dotSize * .75)
                .attr('x', ({ fret, stringFrom }) => `${positions[stringFrom - 1][fret - dotOffset].x}%`)
                .attr('rx', 7.5)
                .attr('width', barreWidth)
                .attr('height', ({ stringFrom, stringTo }) => strings[stringFrom - 1] - strings[stringTo - 1] + 1.5 * dotSize)
                .attr('fill', barresColor);
        }
        baseRender(dotOffset) {
            if (this.baseRendered) {
                return;
            }
            const { wrapper, frets, strings } = this;
            const { height, font, nutColor, nutWidth, stringColor, stringWidth, fretColor, fretWidth, middleFretWidth, middleFretColor, showFretNumbers, fretNumbersMargin, fretNumbersColor, topPadding } = this.options;
            const { totalWidth } = getDimensions(this.options);
            const stringGroup = wrapper
                .append('g')
                .attr('class', 'strings');
            stringGroup
                .selectAll('line')
                .data(strings)
                .enter()
                .append('line')
                .attr('x1', 0)
                .attr('y1', d => d)
                .attr('x2', '100%')
                .attr('y2', d => d)
                .attr('stroke', stringColor)
                .attr('stroke-width', (_d, i) => getStringThickness({ stringWidth, stringIndex: i }));
            const fretsGroup = wrapper
                .append('g')
                .attr('class', 'frets');
            fretsGroup
                .selectAll('line')
                .data(frets)
                .enter()
                .append('line')
                .attr('x1', d => `${d}%`)
                .attr('y1', 1)
                .attr('x2', d => `${d}%`)
                .attr('y2', height - 1)
                .attr('stroke', (_d, i) => {
                switch (i) {
                    case 0:
                        return nutColor;
                    case MIDDLE_FRET + 1:
                        return middleFretColor;
                    default:
                        return fretColor;
                }
            })
                .attr('stroke-width', (_d, i) => {
                switch (i) {
                    case 0:
                        return nutWidth;
                    case MIDDLE_FRET + 1:
                        return middleFretWidth;
                    default:
                        return fretWidth;
                }
            });
            if (showFretNumbers) {
                const fretNumbersGroup = wrapper
                    .append('g')
                    .attr('class', 'fret-numbers')
                    .attr('font-family', font)
                    .attr('transform', `translate(0 ${fretNumbersMargin + topPadding + strings[strings.length - 1]})`);
                fretNumbersGroup
                    .selectAll('text')
                    .data(frets.slice(1))
                    .enter()
                    .append('text')
                    .attr('text-anchor', 'middle')
                    .attr('x', (d, i) => totalWidth / 100 * (d - (d - frets[i]) / 2))
                    .attr('fill', (_d, i) => i === MIDDLE_FRET ? middleFretColor : fretNumbersColor)
                    .text((_d, i) => `${i + 1 + dotOffset}`);
            }
            this.baseRendered = true;
        }
        getDotOffset() {
            const { dots } = this;
            const { crop, fretLeftPadding } = this.options;
            return crop
                ? Math.max(0, Math.min(...dots.map(({ fret }) => fret)) - 1 - fretLeftPadding)
                : 0;
        }
    }

    exports.TetrachordTypes = void 0;
    (function (TetrachordTypes) {
        TetrachordTypes["Major"] = "Major";
        TetrachordTypes["Minor"] = "Minor";
        TetrachordTypes["Phrygian"] = "Phrygian";
        TetrachordTypes["Harmonic"] = "Harmonic";
        TetrachordTypes["Lydian"] = "Lydian";
    })(exports.TetrachordTypes || (exports.TetrachordTypes = {}));
    exports.TetrachordLayouts = void 0;
    (function (TetrachordLayouts) {
        TetrachordLayouts[TetrachordLayouts["Linear"] = 0] = "Linear";
        TetrachordLayouts[TetrachordLayouts["ThreePlusOne"] = 1] = "ThreePlusOne";
        TetrachordLayouts[TetrachordLayouts["TwoPlusTwo"] = 2] = "TwoPlusTwo";
        TetrachordLayouts[TetrachordLayouts["OnePlusThree"] = 3] = "OnePlusThree";
    })(exports.TetrachordLayouts || (exports.TetrachordLayouts = {}));
    const Tetrachords = {
        [exports.TetrachordTypes.Major]: ['M2', 'M2', 'm2'],
        [exports.TetrachordTypes.Minor]: ['M2', 'm2', 'M2'],
        [exports.TetrachordTypes.Phrygian]: ['m2', 'M2', 'M2'],
        [exports.TetrachordTypes.Harmonic]: ['m2', 'A2', 'm2'],
        [exports.TetrachordTypes.Lydian]: ['M2', 'M2', 'M2']
    };
    function tetrachord({ root, type, layout, string, fret } = {
        root: 'E',
        type: exports.TetrachordTypes.Major,
        layout: exports.TetrachordLayouts.Linear,
        string: 6,
        fret: 0
    }) {
        const tetrachord = Tetrachords[type];
        const pattern = [{
                string,
                fret,
                note: root
            }];
        let partial = 0;
        let currentNote = root;
        if (layout === exports.TetrachordLayouts.Linear) {
            tetrachord.forEach(x => {
                const { semitones } = get$4(x);
                currentNote = transpose(currentNote, x);
                partial += semitones;
                pattern.push({
                    string,
                    fret: fret + partial,
                    note: currentNote
                });
            });
            return pattern;
        }
        if (string === 1) {
            throw new Error('Cannot split a tetrachord over two strings if starting on the first one');
        }
        let currentString = string;
        const splitIndex = (() => {
            switch (layout) {
                case exports.TetrachordLayouts.ThreePlusOne:
                    return 2;
                case exports.TetrachordLayouts.TwoPlusTwo:
                    return 1;
                case exports.TetrachordLayouts.OnePlusThree:
                    return 0;
            }
        })();
        tetrachord.forEach((x, i) => {
            const { semitones } = get$4(x);
            currentNote = transpose(currentNote, x);
            if (i === splitIndex) {
                currentString -= 1;
                partial = currentString === 2
                    ? partial - 4
                    : partial - 5;
            }
            partial += semitones;
            const currentFret = fret + partial;
            if (currentFret < 0) {
                throw new Error('Cannot use this layout from this starting fret');
            }
            pattern.push({
                string: currentString,
                fret: currentFret,
                note: currentNote
            });
        });
        return pattern;
    }

    function transform({ box = [], from = { string: 6, fret: 0 }, to = { string: 1, fret: 100 }, action = (x) => x } = {}) {
        function inSelection({ string, fret }) {
            if (string > from.string || string < to.string) {
                return false;
            }
            if (string === from.string && fret < from.fret) {
                return false;
            }
            if (string === to.string && fret > to.fret) {
                return false;
            }
            return true;
        }
        return box.map(x => inSelection(x) ? action(x) : x);
    }
    function disableStrings({ box = [], strings = [] }) {
        return box.map((_a) => {
            var { string } = _a, dot = __rest(_a, ["string"]);
            return (Object.assign({ string, disabled: strings.indexOf(string) > -1 }, dot));
        });
    }
    function sliceBox({ box = [], from = { string: 6, fret: 0 }, to = { string: 1, fret: 100 } } = {}) {
        const sortedBox = box.slice().sort((a, b) => {
            if (a.string > b.string) {
                return -1;
            }
            if (a.fret > b.fret) {
                return 1;
            }
            return -1;
        });
        function findIndex(key) {
            return sortedBox.findIndex(({ string, fret }) => string === key.string && fret === key.fret);
        }
        let fromIndex = findIndex(from);
        if (fromIndex === -1) {
            fromIndex = 0;
        }
        let toIndex = findIndex(to);
        if (toIndex === -1) {
            toIndex = sortedBox.length;
        }
        return sortedBox.slice(fromIndex, toIndex);
    }
    function disableDots({ box = [], from = { string: 6, fret: 0 }, to = { string: 1, fret: 100 } } = {}) {
        const action = (dot) => {
            return Object.assign({ disabled: true }, dot);
        };
        return transform({ box, from, to, action });
    }

    exports.Fretboard = Fretboard;
    exports.FretboardSystem = FretboardSystem;
    exports.GUITAR_TUNINGS = GUITAR_TUNINGS;
    exports.disableDots = disableDots;
    exports.disableStrings = disableStrings;
    exports.sliceBox = sliceBox;
    exports.tetrachord = tetrachord;

    Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=fretboard.umd.js.map

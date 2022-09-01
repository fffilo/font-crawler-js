;(function(root, factory) {
    // AMD.
    if (typeof define === "function" && define.amd)
        define(factory);

    // Node, CommonJS-like
    else if (typeof exports === "object")
        module.exports = factory();

    // Browser globals.
    else
        root.FontCrawler = factory();
} (this, function() {
    // Strict mode.
    "use strict";

    /**
     * Font crawler.
     *
     * @param {HTMLElement} target
     * @param {Object}      options (optional)
     * @type  {Function}
     */
    var FontCrawler = function(target, options) {
        if (!(this instanceof FontCrawler))
            throw "FontCrawler: FontCrawler is a constructor.";

        this._init(target, options);
    };

    /**
     * Font crawler prototype.
     *
     * @type {Object}
     */
    FontCrawler.prototype = {
        /**
         * Reassign constructor.
         *
         * @type {Function}
         */
        constructor: FontCrawler,

        /**
         * Default options.
         *
         * @type {Object}
         */
        _defaults: {
            /**
             * Query selector executed on target.
             *
             * @type {String}
             */
            querySelector: "*",

            /**
             * Include target element into crawler.
             *
             * @type {Boolean}
             */
            includeTarget: true,

            /**
             * Use text nodes only.
             *
             * If set to true elements with no text nodes will be skipped: there
             * is no text on it and the font is not rendered.
             *
             * @type {Boolean}
             */
            useTextNodesOnly: true,

            /**
             * Use pseudo elements.
             *
             * Set this if you wish to check fonts on pseudo elements as well.
             * Use comma delimited string (for example: "before,after").
             *
             * @type {String|Null}
             */
            usePseudoElements: null,

            /**
             * Elements filter method.
             *
             * @type {Function|Null}
             */
            filter: null,

            /**
             * Duration of each async interval (in milliseconds).
             *
             * Math.floor(1000/60)
             *
             * ...one second has 1000ms, divided by 60fps.
             *
             * @type {Number}
             */
            asyncIntervalDuration: 16,
        },

        /**
         * Constructor.
         *
         * @param {HTMLElement} target
         * @param {Object}      options (optional)
         * @type  {Function}
         */
        _init: function(target, options) {
            this._target = target;
            this._options = Object.assign({}, this._defaults, options || {});
        },

        /**
         * Destructor.
         *
         * @return {Void}
         */
        destroy: function() {
            this.clear();

            delete this._options;
            delete this._target;
        },

        /**
         * Target property getter.
         *
         * @return {HTMLElement}
         */
        get target() {
            return this._target;
        },

        /**
         * Window property getter.
         *
         * @return {Window}
         */
        get window() {
            return this.target.ownerDocument.defaultView;
        },

        /**
         * Is async crawl pending.
         *
         * @todo
         * @return {Boolean}
         */
        get isPending() {
            return !!this.__frameInterval;
        },

        /**
         * Get option.
         *
         * @param  {String} key
         * @return {Mixed}
         */
        getOption: function(key) {
            return this._options[key];
        },

        /**
         * Crawl.
         *
         * @return {Object}
         */
        crawl: function() {
            this._checkBusy();

            return this._getEntries().reduce(function(carry, entry) {
                return this._handleEntry(entry, carry);
            }.bind(this), {});
        },

        /**
         * Crawl async.
         *
         * @param  {Function} callback
         * @return {Void}
         */
        crawlAsync: function(callback) {
            this._checkBusy();

            this._getEntriesAsync(function(entries) {
                this._crawlAsyncRequestFrame(entries, {}, callback);
            });
        },

        /**
         * Clear all (cancel async crawl).
         *
         * @return {Void}
         */
        clear: function() {
            if (this.__frameInterval)
                this._cancelAnimationFrame(this.__frameInterval);

            delete this.__frameTimestamp;
            delete this.__frameInterval;
        },

        /**
         * Get all element/pseudo entries.
         *
         * @return {Array}
         */
        _getEntries: function() {
            var elements = this._querySelectorElements();
            elements = this._filterElements(elements);

            var entries = this._mapElementsAsEntries(elements);
            entries = this._addPseudoEntries(entries);
            entries = this._filterEntries(entries);

            return entries;
        },

        /**
         * Get all element/pseudo entries async.
         *
         * @return {Array}
         */
        _getEntriesAsync: function(callback) {
            this._querySelectorElementsAsync(function(elements) {
                this._filterElementsAsync(elements, function(elements) {
                    this._mapElementsAsEntriesAsync(elements, function(entries) {
                        this._addPseudoEntriesAsync(entries, function(entries) {
                            this._filterEntriesAsync(entries, function(entries) {
                                callback.call(this, entries);
                            });
                        });
                    });
                });
            });
        },

        /**
         * Query selector elements:
         * use querySelector option to find all elements on target, and
         * include target if includeTarget option is set to true.
         *
         * @return {Array}
         */
        _querySelectorElements: function() {
            var target = this.target,
                selector = this.getOption("querySelector"),
                includeTarget = this.getOption("includeTarget"),
                nodeList = target.querySelectorAll(selector),
                elements = Array.prototype.slice.call(nodeList);
            if (includeTarget)
                elements.splice(0, 0, target);

            return elements;
        },

        /**
         * Query selector elements asyc.
         *
         * @param  {Function} callback
         * @return {Void}
         */
        _querySelectorElementsAsync: function(callback) {
            this._delayExec(true, this._querySelectorElements, [], callback);
        },

        /**
         * Filter elements:
         * do not use elements without text nodes (if option useTextNodesOnly
         * is set to true).
         *
         * @param  {Array} elements
         * @return {Array}
         */
        _filterElements: function(elements) {
            var useTextNodesOnly = this.getOption("useTextNodesOnly");
            if (useTextNodesOnly)
                elements = elements.filter(function(element) {
                    return this._hasTextNodeChild(element);
                }.bind(this));

            return elements;
        },

        /**
         * Filter elements async.
         *
         * @param  {Array}    elements
         * @param  {Function} callback
         * @return {Void}
         */
        _filterElementsAsync: function(elements, callback) {
            this._delayExec(this.getOption("useTextNodesOnly"), this._filterElements, [ elements ], callback);
        },

        /**
         * Map elements as entries:
         * map each element as array of element and null (where null is pseudo
         * element).
         *
         * @param  {Array} elements
         * @return {Array}
         */
        _mapElementsAsEntries: function(elements) {
            return elements.map(function(element) {
                return [ element, null ];
            });
        },

        /**
         * Map elements as entries async.
         *
         * @param  {Array}    elements
         * @param  {Function} callback
         * @return {Void}
         */
        _mapElementsAsEntriesAsync: function(elements, callback) {
            this._delayExec(false, this._mapElementsAsEntries, [ elements ], callback);
        },

        /**
         * Add pseudo entries:
         * expand list of entries with pseudo elements from usePseudoElements
         * option.
         *
         * @param  {Array} entries
         * @return {Array}
         */
        _addPseudoEntries: function(entries) {
            var pseudoElements = this.getOption("usePseudoElements");
            if (pseudoElements) {
                pseudoElements = pseudoElements.replace(/[^\w\-,]/g, "").split(",");

                return entries.reduce(function(carry, entry) {
                    carry.push(entry);

                    pseudoElements.forEach(function(pseudo) {
                        carry.push([ entry[0], "::" + pseudo ]);
                    });
                }, []);
            }

            return entries;
        },

        /**
         * Add pseudo entries async.
         *
         * @param  {Array}    entries
         * @param  {Function} callback
         * @return {Void}
         */
        _addPseudoEntriesAsync: function(entries, callback) {
            this._delayExec(this.getOption("usePseudoElements"), this._addPseudoEntries, [ entries ], callback);
        },

        /**
         * Filter entries:
         * ...with method defined in filter option.
         *
         * @param  {Array} entries
         * @return {Array}
         */
        _filterEntries: function(entries) {
            var filter = this.getOption("filter");
            if (typeof filter === "function")
                entries = entries.filter(function(entry) {
                    return filter.call(this, entry[0], entry[1]);
                });

            return entries;
        },

        /**
         * Filter entries async.
         *
         * @param  {Array}    entries
         * @param  {Function} callback
         * @return {Void}
         */
        _filterEntriesAsync: function(entries, callback) {
            this._delayExec(typeof this.getOption("filter") === "function", this._filterEntries, [ entries ], callback);
        },

        /**
         * Delay method execution (request animation frame) if condition
         * argument is truthy.
         *
         * @param  {Boolean}   condition
         * @param  {Function}  method
         * @param  {Array}     args
         * @param  {Function}  callback
         * @return {Void}
         */
        _delayExec: function(condition, method, args, callback) {
            if (condition)
                this._requestAnimationFrame(function() {
                    callback.call(this, method.apply(this, args));
                }.bind(this));
            else
                callback.call(this, method.apply(this, args));
        },

        /**
         * Check if async crawler is pending and throw exception if so.
         *
         * @return {Void}
         */
        _checkBusy: function() {
            if (this.isPending)
                throw "FontCrawler: FontCrawler is busy.";
        },

        /**
         * Element has text node child.
         *
         * @param  {HTMLElement} element
         * @return {Boolean}
         */
        _hasTextNodeChild: function(element) {
            for (var i = 0; i < element.childNodes.length; i++) {
                if (element.childNodes[i].nodeType === Node.TEXT_NODE)
                    return true;
            }

            return false;
        },

        /**
         * Get computed style for element.
         *
         * @param  {HTMLElement}         element
         * @param  {String}              pseudo
         * @return {CSSStyleDeclaration}
         */
        _getComputedStyle: function(element, pseudo) {
            return this.window.getComputedStyle(element, pseudo);
        },

        /**
         * Request animation frame.
         *
         * @param  {Function} callback
         * @return {Number}
         */
        _requestAnimationFrame: function(callback) {
            return this.window.requestAnimationFrame(callback);
        },

        /**
         * Cancel animation frame request.
         *
         * @param  {Number} requestID
         * @return {Void}
         */
        _cancelAnimationFrame: function(requestID) {
            this.window.cancelAnimationFrame(requestID);
        },

        /**
         * Get current timestamp (in milliseconds).
         *
         * @return {Number}
         */
        _getTimestamp: function() {
            return (new Date()).getTime() / 1000;
        },

        /**
         * Request frame animation for async crawl.
         *
         * @param  {Array}    entries
         * @param  {Object}   source
         * @param  {Function} callback
         * @return {Void}
         */
        _crawlAsyncRequestFrame: function(entries, source, callback) {
            this.__frameInterval = this._requestAnimationFrame(this._crawlAsyncCallback.bind(this, entries, source, callback));
        },

        /**
         * Async crawl callback: handle entry recursively.
         *
         * @param  {Array}    entries
         * @param  {Object}   source
         * @param  {Function} callback
         * @return {Void}
         */
        _crawlAsyncCallback: function(entries, source, callback) {
            if (!this.__frameTimestamp)
                this.__frameTimestamp = this._getTimestamp();

            this._handleEntry(entries.shift(), source);
            this._crawlAsyncRecursion(entries, source, callback);
        },

        /**
         * Async crawl recursion: request async crawl callback (see above) in
         * current or next animated interval (or clear all on empty entries).
         *
         * @param  {Array}    entries
         * @param  {Object}   source
         * @param  {Function} callback
         * @return {Void}
         */
        _crawlAsyncRecursion: function(entries, source, callback) {
            if (!entries.length)
                return this._crawlAsyncClear(source, callback);

            var start = this.__frameTimestamp,
                now = this._getTimestamp(),
                delay = now - start,
                asyncIntervalDuration = this.getOption("asyncIntervalDuration");
            if (delay < asyncIntervalDuration/1000)
                return this._crawlAsyncCallback(entries, source, callback);

            this.clear();

            return this._crawlAsyncRequestFrame(entries, source, callback);
        },

        /**
         * Clear async crawl and execute callback.
         *
         * @param  {Object}   source
         * @param  {Function} callback
         * @return {Void}
         */
        _crawlAsyncClear: function(source, callback) {
            this.clear();

            if (typeof callback === "function")
                this._requestAnimationFrame(callback.bind(this, source));
        },

        /**
         * Entry handler:
         * get element/pseudo and execute event handler.
         *
         * @param  {Array}  entry
         * @param  {Object} source
         * @return {Object}
         */
        _handleEntry: function(entry, source) {
            var element = entry[0],
                pseudo = entry[1];

            return this._handleElement(element, pseudo, source);
        },

        /**
         * Element handler:
         * get element css and execute source handler.
         *
         * @param  {HTMLElement} element
         * @param  {String|Null} pseudo
         * @param  {Object}      source
         * @return {Object}
         */
        _handleElement: function(element, pseudo, source) {
            var style = this._getComputedStyle(element, pseudo),
                css = {
                    fontFamily: style.getPropertyValue("font-family"),
                    fontWeight: style.getPropertyValue("font-weight"),
                    fontStyle: style.getPropertyValue("font-style"),
                };

            return this._handleSource(element, pseudo, css, source);
        },

        /**
         * Source handler:
         * transform css to specific format and store it to source.
         *
         * @param  {HTMLElement} element
         * @param  {String|Null} pseudo
         * @param  {Object}      css
         * @param  {Object}      source
         * @return {Object}
         */
        _handleSource: function(element, pseudo, css, source) {
            var map = css.fontWeight + (css.fontStyle === "normal" ? "" : "i");
            if (!(css.fontFamily in source))
                source[css.fontFamily] = [];
            if (source[css.fontFamily].indexOf(map) === -1) {
                source[css.fontFamily].push(map);
                source[css.fontFamily].sort();
            }

            return source;
        },
    };

    // Class as result.
    return FontCrawler;
}));

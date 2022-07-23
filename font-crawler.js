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
             * @type {String|Boolean}
             */
            usePseudoElements: false,

            /**
             * Elements filter method.
             *
             * @type {Function|Null}
             */
            filter: null,

            /**
             * Elements to process on single async interval.
             *
             * @type {Number}
             */
            asyncMax: 1000,
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
            delete this._options;
            delete this._element;
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
            return this._elementWithPseudoEntries().reduce(function(carry, entry) {
                var element = entry[0],
                    pseudo = entry[1];

                return this._handleElement(element, pseudo, carry);
            }.bind(this), {});
        },

        /**
         * Crawl async.
         *
         * @param  {Function} callback
         * @return {Void}
         */
        crawlAsync: function(callback) {
            var count = this.getOption("asyncMax")*1;
            if (!count || count < 0)
                count = this._defaults.asyncMax;

            this._crawlAsyncRecursive(this._elementWithPseudoEntries(), count, {}, callback);
        },

        /**
         * Get all element/pseudo entries.
         *
         * @return {Array}
         */
        _elementWithPseudoEntries: function(elements) {
            var target = this.target,
                selector = this.getOption("querySelector"),
                includeTarget = this.getOption("includeTarget"),
                pseudoElements = this.getOption("usePseudoElements"),
                useTextNodesOnly = this.getOption("useTextNodesOnly"),
                filter = this.getOption("filter"),
                children = target.querySelectorAll(selector),
                elements = Array.prototype.slice.call(children);
            if (includeTarget)
                elements.splice(0, 0, target);
            if (pseudoElements)
                pseudoElements = pseudoElements.replace(/[^\w\-,]/g, "").split(",");

            return elements
                .reduce(function(carry, element) {
                    carry.push([ element, null ]);
                    (pseudoElements || []).forEach(function(pseudo) {
                        carry.push([ element, "::" + pseudo ]);
                    });

                    return carry;
                }, [])
                .filter(function(entry) {
                    if (useTextNodesOnly && !this._hasTextNodeChild(entry[0]))
                        return false;

                    return typeof filter === "function" ? filter.call(this, entry[0], entry[1]) : true;
                }.bind(this));
        },

        /**
         * Get child nodes of element with node type text node.
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
         * Crawl async (with recursion).
         *
         * @param  {Array}    entries
         * @param  {Number}   count
         * @param  {Object}   source
         * @param  {Function} callback
         * @return {Void}
         */
        _crawlAsyncRecursive: function(entries, count, source, callback) {
            this._requestAnimationFrame(function() {
                var done = 0;
                while (done++ < count && entries.length) {
                    var entry = entries.shift(),
                        element = entry[0],
                        pseudo = entry[1];

                    this._handleElement(element, pseudo, source);
                }

                if (entries.length)
                    this._crawlAsyncRecursive.call(this, entries, count, source, callback);
                else if (typeof callback === "function")
                    callback.call(this, source);
            }.bind(this));
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

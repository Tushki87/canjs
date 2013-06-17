steal('can/util', 'can/observe/attributes', function (can) {
  

	var removeOuterDots = function(str){
		return str.replace(/\.$/, '').replace(/^\./, '');
	}

	// adds errors recursively for the object
	var addRecursiveErrors = function(item, attr, addErrors, funcs, path){

		var currentPath = removeOuterDots(attr.shift()),
			items       = currentPath !== '' ? item.attr(currentPath) : (item.length ? item : [item]),
			itemPath;

		path.push(currentPath);

		for(var i = 0; i < items.length; i++){
			if(attr.length > 1){
				itemPath = path.slice(0);
				itemPath.push(i);
				addRecursiveErrors(items[i], attr.slice(0), addErrors, funcs, itemPath);
			} else {
				itemPath = path.slice(0);
				if(attr[0] === ''){
					itemPath.push(i);
					addErrors(removeOuterDots(itemPath.join('.')), funcs);
				} else {
					itemPath.push(i, attr[0].replace(/\.$/, '').replace(/^\./, ''));
					addErrors(removeOuterDots(itemPath.join('.')), funcs);
				}
			}
		}
	}


//validations object is by property.  You can have validations that
//span properties, but this way we know which ones to run.
//  proc should return true if there's an error or the error message
//

	var validate = function (attrNames, options, proc) {

		// normalize argumetns
		if (!proc) {
			proc = options;
			options = {};
		}

		options = options || {};
		attrNames = typeof attrNames == 'string' ? [attrNames] : can.makeArray(attrNames);

		// run testIf if it exists
		if (options.testIf && !options.testIf.call(this)) {
			return;
		}

		var self = this;
		can.each(attrNames, function (attrName) {
			// Add a test function for each attribute
			if (!self.validations[attrName]) {
				self.validations[attrName] = [];
			}

			self.validations[attrName].push(function (newVal, realAttrName) {
				// if options has a message return that, otherwise, return the error
				var res = proc.call(this, newVal, realAttrName);
				return res === undefined ? undefined : (options.message || res);
			})
		});
	};

	var validator = function(ev, prop, how, newValue, oldValue){
		var self = this,
			validations = self.constructor.validations,
			errorCallback = function (errors) {
				can.trigger(self, "error", [prop, errors], true);
				return false;
			}

		if (validations && validations[prop]) {
			var errors = self.errors(prop);
			errors && errorCallback(errors);
		}
	}

	var boundObserves = {};

	var bind = can.Observe.prototype.bind;

	// Only bind to changes if something else is also bound to this object
	// so there wouldn't be memory leaks
	can.Observe.prototype.bind = function(){
		var self = bind.apply(this, arguments);

		if(this.constructor.validations && !boundObserves[this._cid]){
			boundObserves[this._cid] = true;
			this.bind('change' + this._cid, can.proxy(validator, this));
		}

		return self;
	}

	var unbind = can.Observe.prototype.unbind;

	// if there is only one binding left, and there was a binding because
	// of the validations, then unbind it
	can.Observe.prototype.unbind = function(){
		var self = unbind.apply(this, arguments);

		if(this._bindings === 1 && boundObserves[this._cid]){
			delete boundObserves[this._cid];
			this.unbind('change' + this._cid);
		}

		return self;
	}

	can.each([ can.Observe, can.Model, can.Observe.List ], function (clss) {
		// in some cases model might not be defined quite yet.
		if (clss === undefined) {
			return;
		}
		var oldSetup = clss.setup;

		/**
		 * @static
		 */
		can.extend(clss, {
			setup : function (superClass) {
				oldSetup.apply(this, arguments);
				if (!this.validations || superClass.validations === this.validations) {
					this.validations = {};
				}
			},
			/**
			 * @function can.Observe.validations.static.validate validate
			 * @parent can.Observe.validations
			 * `validate(attrNames, [options,] validateProc(value, attrName) )` validates each of the
			 * specified attributes with the given `validateProc` function.  The function
			 * should return a value if there is an error.  By default, the return value is
			 * the error message.  Validations should be set in the Constructor's static init method.
			 *
			 * The following example validates that a person's age is a number:
			 *
			 *     Person = can.Observe({
			 *         init : function(){
			 *           this.validate(["age"], function(val){
			 *             if( typeof val === 'number' ){
			 *               return "must be a number"
			 *             }
			 *           })
			 *         }
			 *     },{})
			 *
			 *
			 * The error message can be overwritten with `options` __message__ property:
			 *
			 *     Person = can.Observe({
			 *         init : function(){
			 *           this.validate(
			 *             "age",
			 *           {message: "must be a number"},
			 *           function(val){
			 *               if( typeof val === 'number' ){
			 *                 return true
			 *               }
			 *           })
			 *       }
			 *     },{})
			 *
			 * @param {Array<String>|String} attrNames Attribute name(s) to to validate
			 *
			 * @param {Object} [options] Options for the
			 * validations.  Valid options include 'message' and 'testIf'.
			 *
			 * @param {function(*,String)} validateProc(value,attrName) Function used to validate each
			 * given attribute. Returns nothing if valid and an error message
			 * otherwise. Function is called in the instance context and takes the
			 * `value` and `attrName` to validate.
			 *
			 */
			validate : validate,

			/**
			 * @property can.Observe.validations.static.validationMessages validationMessages
			 * @parent can.Observe.validations
			 *
			 * `validationMessages` has the default validation error messages that will be returned by the builtin
			 * validation methods. These can be overwritten by assigning new messages
			 * to `can.Observe.validationMessages` in your application setup.
			 *
			 * The following messages (with defaults) are available:
			 *
			 *  * format - "is invalid"
			 *  * inclusion - "is not a valid option (perhaps out of range)"
			 *  * lengthShort - "is too short"
			 *  * lengthLong - "is too long"
			 *  * presence - "can't be empty"
			 *  * range - "is out of range"
			 *
			 * It is important to steal can/observe/validations before
			 * overwriting the messages, otherwise the changes will
			 * be lost once steal loads it later.
			 *
			 * ## Example
			 *
			 *     can.Observe.validationMessages.format = "is invalid dummy!"
			 */
			validationMessages : {
				format : "is invalid",
				inclusion : "is not a valid option (perhaps out of range)",
				lengthShort : "is too short",
				lengthLong : "is too long",
				presence : "can't be empty",
				range : "is out of range",
				numericality: "must be a number"
			},

			/**
			 * @function can.Observe.validations.static.validateFormatOf validateFormatOf
			 * @parent can.Observe.validations
			 *
			 * `validateFormatOf(attrNames, regexp, options)` validates where the values of
			 * specified attributes are of the correct form by
			 * matching it against the regular expression provided.
			 *
			 *     init : function(){
			 *          this.validateFormatOf(["email"],/[\w\.]+@]w+\.\w+/,{
			 *            message : "invalid email"
			 *       })
			 *     }
			 *
			 * @param {Array<String>|String} attrNames Attribute name(s) to to validate
			 * @param {RegExp} regexp Regular expression used to match for validation
			 * @param {Object} [options] Options for the validations.  Valid options include 'message' and 'testIf'.
			 */
			validateFormatOf : function (attrNames, regexp, options) {
				validate.call(this, attrNames, options, function (value) {
					if ((typeof value !== 'undefined' && value !== null && value !== '')
						&& String(value).match(regexp) == null) {
						return this.constructor.validationMessages.format;
					}
				});
			},

			/**
			 * @function can.Observe.validations.static.validateInclusionOf validateInclusionOf
			 * @parent can.Observe.validations
			 *
			 * Validates whether the values of the specified attributes are available in a particular
			 * array.
			 *
			 *     init : function(){
			 *       this.validateInclusionOf(["salutation"],["Mr.","Mrs.","Dr."])
			 *     }
			 *
			 * @param {Array<String>|String} attrNames Attribute name(s) to to validate
			 * @param {Array} inArray Array of options to test for inclusion
			 * @param {Object} [options] Options for the validations.  Valid options include 'message' and 'testIf'.
			 */
			validateInclusionOf : function (attrNames, inArray, options) {
				validate.call(this, attrNames, options, function (value) {
					if (typeof value == 'undefined') {
						return;
					}

					for(var i = 0; i < inArray.length; i++) {
						if(inArray[i] == value) {
							return;
						}
					}

					return this.constructor.validationMessages.inclusion;
				});
			},

			/**
			 * @function can.Observe.validations.static.validateLengthOf validateLengthOf
			 * @parent can.Observe.validations
			 *
			 * Validates that the specified attributes' lengths are in the given range.
			 *
			 *     init : function(){
			 *       this.validateInclusionOf(["suffix"],3,5)
			 *     }
			 *
			 * @param {Array<String>|String} attrNames Attribute name(s) to to validate
			 * @param {Number} min Minimum length (inclusive)
			 * @param {Number} max Maximum length (inclusive)
			 * @param {Object} [options] Options for the validations.  Valid options include 'message' and 'testIf'.
			 */
			validateLengthOf : function (attrNames, min, max, options) {
				validate.call(this, attrNames, options, function (value) {
					if (((typeof value === 'undefined' || value === null) && min > 0) ||
							(typeof value !== 'undefined' && value !== null && value.length < min)) {
						return this.constructor.validationMessages.lengthShort + " (min=" + min + ")";
					} else if (typeof value != 'undefined' && value !== null && value.length > max) {
						return this.constructor.validationMessages.lengthLong + " (max=" + max + ")";
					}
				});
			},

			/**
			 * @function can.Observe.validations.static.validatePresenceOf validatePresenceOf
			 * @parent can.Observe.validations
			 *
			 * Validates that the specified attributes are not blank.
			 *
			 *     init : function(){
			 *       this.validatePresenceOf(["name"])
			 *     }
			 *
			 * @param {Array<String>|String} attrNames Attribute name(s) to to validate
			 * @param {Object} [options] Options for the validations.  Valid options include 'message' and 'testIf'.
			 */
			validatePresenceOf : function (attrNames, options) {
				validate.call(this, attrNames, options, function (value) {
					if (typeof value == 'undefined' || value === "" || value === null) {
						return this.constructor.validationMessages.presence;
					}
				});
			},

			/**
			 * @function can.Observe.validations.static.validateRangeOf validateRangeOf
			 * @parent can.Observe.validations
			 *
			 * Validates that the specified attributes are in the given numeric range.
			 *
			 *     init : function(){
			 *       this.validateRangeOf(["age"],21, 130);
			 *     }
			 *
			 * @param {Array<String>|String} attrNames Attribute name(s) to to validate
			 * @param {Number} low Minimum value (inclusive)
			 * @param {Number} hi Maximum value (inclusive)
			 * @param {Object} [options] (optional) Options for the validations.  Valid options include 'message' and 'testIf'.
			 */
			validateRangeOf : function (attrNames, low, hi, options) {
				validate.call(this, attrNames, options, function (value) {
					if (((typeof value == 'undefined' || value === null) && low > 0) ||
							(typeof value !== 'undefined' && value !== null && (value < low || value > hi) )) {
						return this.constructor.validationMessages.range + " [" + low + "," + hi + "]";
					}
				});
			},
			
			/**
			 * @function can.Observe.validations.static.validatesNumericalityOf validatesNumericalityOf
			 * @parent can.Observe.validations
			 *
			 * Validates that the specified attributes is a valid Number.
			 *
			 *     init : function(){
			 *       this.validatesNumericalityOf(["age"]);
			 *     }
			 *
			 * @param {Array|String} attrNames Attribute name(s) to to validate
			 */
			validatesNumericalityOf : function (attrNames) {
				validate.call(this, attrNames, function (value) {
					var res = !isNaN(parseFloat(value)) && isFinite(value);
					if (!res) {
						return this.constructor.validationMessages.numericality;
					}
				});
			}
		});
	});

	can.extend(can.Observe.prototype, {
		/**
		 * @prototype
		 */
		/**
		 * @function can.Observe.validations.prototype.errors errors
		 * @parent can.Observe.validations.prototype
		 *
		 * Runs the validations on this observe.  You can
		 * also pass it an array of attributes to run only those attributes.
		 * It returns nothing if there are no errors, or an object
		 * of errors by attribute.
		 *
		 * To use validations, it's suggested you use the
		 * observe/validations plugin.
		 *
		 *     can.Observe("Task",{
		 *       init : function(){
		 *         this.validatePresenceOf("dueDate")
		 *       }
		 *     },{});
		 *
		 *     var task = new Task(),
		 *         errors = task.errors()
		 *
		 *     errors.dueDate[0] //-> "can't be empty"
		 *
		 * @param {Array<String>|String} [attrs] An optional list of attributes to get errors for:
		 *
		 *     task.errors(['dueDate','name']);
		 *
		 * Or it can take a single attr name like:
		 *
		 *     task.errors('dueDate')
		 *
		 * @param {Object} [newVal] An optional new value to test setting
		 * on the observe.  If `newVal` is provided,
		 * it returns the errors on the observe if `newVal` was set.
		 *
		 * @return {Object<String, Array<String>>} an object of attributeName : [errors] like:
		 *
		 *     task.errors() // -> {dueDate: ["can't be empty"]}
		 *
		 * or `null` if there are no errors.
		 */
		errors : function (attrs, newVal) {
			// convert attrs to an array
			if (attrs) {
				attrs = can.isArray(attrs) ? attrs : [attrs];
			}

			var errors = {},
				self = this,
				attr,
			// helper function that adds error messages to errors object
			// attr - the name of the attribute
			// funcs - the validation functions
				addErrors = function (attr, funcs) {
					can.each(funcs, function (func) {
						var res = func.call(self, isTest ? ( self.__convert ?
							self.__convert(attr, newVal) :
							newVal ) : self.attr(attr), attr);
						if (res) {
							if (!errors[attr]) {
								errors[attr] = [];
							}
							errors[attr].push(res);
						}

					});
				},
				validations = this.constructor.validations || {},
				isTest = attrs && attrs.length === 1 && arguments.length === 2;

			// go through each attribute or validation and
			// add any errors
			can.each(attrs || validations || {}, function (funcs, attr) {
				var convertedAttr;
				// if we are iterating through an array, use funcs
				// as the attr name
				if (typeof attr == 'number') {
					attr = funcs;
					convertedAttr = attr.replace(/(^|\.)\d+(\.|$)/g, function(match, leadingDot, trailingDot){ 
						return leadingDot + '*' + trailingDot;
					});
					funcs = validations[convertedAttr];
				}
				// add errors to the
				if(attr.indexOf('*') !== -1){
					addRecursiveErrors(self, attr.split('*'), addErrors, funcs || [], []);
				} else {
					addErrors(attr, funcs || []);
				}
				
			});

			this.each(function(prop, attr){
				can.each(prop && prop.errors && prop.errors() || {}, function(error, nestedAttr){
					var path = attr + '.' + nestedAttr;
					errors[path] = errors[path] || [];
					errors[path].push.apply(errors[path], error);
				});
			})

			// return errors as long as we have one
			return can.isEmptyObject(errors) ? null : isTest ? errors[attrs[0]] : errors;
		}
	});
	return can.Observe;
});

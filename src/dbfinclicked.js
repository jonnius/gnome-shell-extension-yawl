/* -*- mode: js2; js2-basic-offset: 4; c-basic-offset: 4; tab-width: 4; indent-tabs-mode: nil -*-  */
/*
 * YAWL (Yet Another Window List) Gnome-Shell Extension
 * Copyright (C) 2013 Vadim @ dbFin <vadim@dbfin.com>
 * You should have received a copy of the License along with this program.
 *
 * dbfinclicked.js
 * Mouse clicks.
 *
 */

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Clutter = imports.gi.Clutter;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Convenience = Me.imports.convenience2;
const dbFinArrayHash = Me.imports.dbfinarrayhash;
const dbFinSignals = Me.imports.dbfinsignals;
const dbFinUtils = Me.imports.dbfinutils;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const _D = Me.imports.dbfindebug._D;

const dbFinClicked = new Lang.Class({
	Name: 'dbFin.Clicked',

	/* callback(state, settingsKey):	state == { left:, right:, middle:, ctrl:, shift:, clicks:, scroll:, up: }
	 *	 					            		where left, right, middle, ctrl, shift, scroll, up are either true or false
	 * 												  clicks is the number of clicks
	 *									settingsKey is a string of the form
	 *											'left/right/middle[-ctrl][-shift]' or 'scroll'
	 */
    _init: function(emitter, callback, scope, doubleClicks/* = false*/, scroll/* = false*/,
                    sendSingleClicksImmediately/* = false*/, clickOnRelease/* = false*/) {
        _D('>' + this.__name__ + '._init()');
        this._signals = new dbFinSignals.dbFinSignals();
        this._settings = Convenience.getSettings();
        this._settingsGlobal = dbFinUtils.settingsGetGlobalSettings('org.gnome.settings-daemon.peripherals.mouse');
		this._emitter = emitter;
		this._callback = callback;
		this._scope = scope;
        this._scroll = !!scroll;
		this._double = !!doubleClicks;
		this._single = !!sendSingleClicksImmediately;
		this._release = !!clickOnRelease;
		this._state = {};
		this._stateTimeouts = new dbFinArrayHash.dbFinArrayHash();
        for (let stateNumber = 0; stateNumber < 16; ++stateNumber) this._stateTimeouts.set(stateNumber, null);

		dbFinUtils.settingsVariable(this, 'mouse-clicks-time-threshold',
		                            //use global settings as a fallback
		                            dbFinUtils.settingsGetInteger(this._settingsGlobal, 'double-click', 333),
		                            { min: 150, max: 550 });

		this._signals.connectNoId({	emitter: this._emitter, signal: 'button-press-event',
								  	callback: this._buttonPressEvent, scope: this });
		if (this._release) {
			this._signals.connectNoId({	emitter: this._emitter, signal: 'button-release-event',
									  	callback: this._buttonReleaseEvent, scope: this });
		}
        if (this._scroll) {
            this._signals.connectNoId({	emitter: this._emitter, signal: 'scroll-event',
                                        callback: this._scrollEvent, scope: this });
        }
        _D('<');
    },

	destroy: function() {
        _D('>' + this.__name__ + '.destroy()');
        if (this._signals) {
            this._signals.destroy();
            this._signals = null;
        }
		if (this._stateTimeouts) {
			this._stateTimeouts.forEach(Lang.bind(this, function (stateNumber, timeout) {
				if (timeout) Mainloop.source_remove(timeout);
            }));
			this._stateTimeouts.destroy();
			this._stateTimeouts = null;
		}
		this._emitter = null;
		this._callback = null;
		this._scope = null;
		this._state = {};
        this._settingsGlobal = null;
        this._settings = null;
        _D('<');
    },

	_getState: function(event) {
		_D('>' + this.__name__ + '._getState()');
		if (!event || !event.get_button || !event.get_state) {
			_D(!event ? 'event === null' : !event.get_button ? 'event.get_button === null' : 'event.get_state === null');
			_D('<');
			return {};
		}
		let (state = {},
		     eventButton = event.get_button()) {
			if (eventButton > 0 && eventButton <= 3) {
				state.left = eventButton == 1;
				state.right = eventButton == 3;
				state.middle = eventButton == 2;
				state.scroll = false;
				let (eventState = event.get_state()) {
					state.ctrl = !!(eventState & Clutter.ModifierType.CONTROL_MASK);
					state.shift = !!(eventState & Clutter.ModifierType.SHIFT_MASK);
				} // let (eventState)
			} // if (eventButton > 0 && eventButton <= 3)
            _D('<');
            return state;
		} // let (state, eventButton)
	},

	_getStateScroll: function(event) {
		_D('>' + this.__name__ + '._getStateScroll()');
		if (!event || !event.get_scroll_direction) {
			_D(!event ? 'event === null' : 'event.get_scroll_direction === null');
			_D('<');
			return {};
		}
		let (state = {},
		     direction = event.get_scroll_direction()) {
			state.left = false;
			state.right = false;
			state.middle = false;
			state.scroll = true;
			state.up = direction == Clutter.ScrollDirection.UP;
            _D('<');
            return state;
		} // let (state, direction)
	},

    _getStateNumber: function(state) { // state number: [shift][ctrl][middle/right][left/right]
        _D('>' + this.__name__ + '._getStateNumber()');
        let (stateNumber = 0) {
            if (state.left) stateNumber = 1;
            else if (state.right) stateNumber = 3;
            else if (state.middle) stateNumber = 2;
			if (stateNumber) {
				if (state.ctrl) stateNumber += 4;
				if (state.shift) stateNumber += 8;
			}
    		_D('<');
            return stateNumber;
        } // let (stateNumber)
    },

    _getStateByNumber: function(stateNumber) {
        _D('>' + this.__name__ + '._getStateByNumber()');
        let (state = {}, button = stateNumber & 3) {
            if (button) {
                state.left = button == 1;
                state.right = button == 3;
                state.middle = button == 2;
                state.ctrl = !!(stateNumber & 4);
                state.shift = !!(stateNumber & 8);
            }
    		_D('<');
            return state;
        } // let (state, button)
    },

	_getStateSettingsKey: function(state) {
        _D('>' + this.__name__ + '._getStateSettingsKey()');
		let (key = '') {
			if (state.left || state.right || state.middle) {
				if (state.left) key = 'left';
				else if (state.right) key = 'right';
				else key = 'middle';
				if (state.ctrl) key += '-ctrl';
				if (state.shift) key += '-shift';
			} // if (state.left || state.right || state.middle)
			else if (state.scroll) {
				key = 'scroll';
			} // if (state.left || state.right || state.middle) else if (state.scroll)
			_D('<');
			return key;
		} // let (key)
	},

    _buttonPressEvent: function(actor, event) {
        _D('>' + this.__name__ + '._buttonPressEvent()');
		let (state = this._getState(event)) {
            if (state.left || state.right || state.middle) {
				if (!this._release) {
					this._registerClick(state);
				}
				else {
					// do not care about modifiers so far
					this._state = {};
					this._state.left = state.left;
					this._state.right = state.right;
					this._state.middle = state.middle;
				} // if (!this._release) else
			} // if (state.left || state.right || state.middle)
		} // let (state)
        _D('<');
	},

    _buttonReleaseEvent: function(actor, event) {
        _D('>' + this.__name__ + '._buttonReleaseEvent()');
		let (state = this._getState(event)) {
			if (	this._state && state.left == this._state.left
			    	&& state.right == this._state.right && state.middle == this._state.middle) {
				this._registerClick(state);
				this._state = {};
			}
		} // let (state)
        _D('<');
	},

	_scrollEvent: function(actor, event) {
        _D('>' + this.__name__ + '._scrollEvent()');
		let (state = this._getStateScroll(event)) {
			if (state.scroll) this._callBack(state);
		} // let (state)
        _D('<');
	},

	_registerClick: function(state) {
        _D('>' + this.__name__ + '._registerClick()');
		let (stateNumber = this._getStateNumber(state)) {
			if (stateNumber) {
				let (timeout = this._stateTimeouts.get(stateNumber)) {
					if (!timeout) { // first click
						if (this._single || !this._double) { // if send first click immediately or if no double clicks
							this._onTimeout(stateNumber, 1);
						}
						if (this._double) { // if double clicks
							timeout = Mainloop.timeout_add(this._mouseClicksTimeThreshold, Lang.bind(this, function() {
								Lang.bind(this, this._onTimeout)(stateNumber, this._single ? 0 : 1);
							}));
							this._stateTimeouts.set(stateNumber, timeout);
						}
					}
					else { // second click
	                    this._stateTimeouts.set(stateNumber, null);
						Mainloop.source_remove(timeout);
						this._onTimeout(stateNumber, 2);
					} // if (!timeout) else
				} // let (timeout)
			} // if (stateNumber)
		} // let (stateNumber)
        _D('<');
	},

    _onTimeout: function(stateNumber, clicks) {
        _D('>' + this.__name__ + '._onTimeout()');
        if (!stateNumber) {
            _D('<');
            return false;
        }
		// coming here should be:
		// 	this._double	this._single	clicks	timeout
		//	false			?				1		-
		//	true			false			1		+
		//									2		-
		//					true			0		+
		//									1		-
		//									2		-
        let (timeout = this._stateTimeouts.get(stateNumber)) {
			if (this._double && !this._single && clicks == 1 && !timeout) { // got called after receiving second click
				_D('<');
				return false;
			}
			if (timeout) this._stateTimeouts.set(stateNumber, null);
			if (clicks) {
				let (state = this._getStateByNumber(stateNumber)) {
					state.clicks = clicks;
					this._callBack(state);
				} // let (state)
			} // if (clicks)
        } // let (timeout)
        _D('<');
        return false;
    },

	_callBack: function(state) {
        _D('>' + this.__name__ + '._callBack()');
		if (this._callback) {
			let (key = this._getStateSettingsKey(state)) {
				Mainloop.timeout_add(77, Lang.bind(this, function() {
					if (this._scope) Lang.bind(this._scope, this._callback)(state, key);
					else this._callback(state, key);
				}));
			} // let (key)
		}
        _D('<');
	}
});
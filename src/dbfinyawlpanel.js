/* -*- mode: js2; js2-basic-offset: 4; c-basic-offset: 4; tab-width: 4; indent-tabs-mode: nil -*-  */
/*
 * YAWL (Yet Another Window List) Gnome-Shell Extension
 * Copyright (C) 2013 Vadim @ dbFin <vadim@dbfin.com>
 * You should have received a copy of the License along with this program.
 *
 * dbfinyawlpanel.js
 * YAWL Panel.
 *
 */

const Lang = imports.lang;
const Signals = imports.signals;

const Clutter = imports.gi.Clutter;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Main = imports.ui.main;
const Overview = imports.ui.overview;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const dbFinAnimation = Me.imports.dbfinanimation;
const dbFinArrayHash = Me.imports.dbfinarrayhash;
const dbFinSignals = Me.imports.dbfinsignals;
const dbFinUtils = Me.imports.dbfinutils;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const _D = Me.imports.dbfindebug._D;

const dbFinYAWLPanel = new Lang.Class({
	Name: 'dbFin.YAWLPanel',

    // GNOMENEXT: ui/panel.js: class Panel
    // e.g. Main.panel, 'panelYAWL', 'panelYAWLBox', '_yawlPanel'
    _init: function(parent, panelname, boxname, parentproperty,
                    hidden/* = false*/, autohideinoverview/* = false*/, hidechildren/* = false*/, gravity/* = 0.0*/) {
        _D('>' + this.__name__ + '._init()');
        this._parent = parent || null;
        this._panelName = panelname || '';
        this._boxName = boxname || '';
        this._parentProperty = parentproperty || '';
        hidden = hidden || false;
		autohideinoverview = autohideinoverview || false;
        this._hideChildren = hidechildren || false;
        this._gravity = gravity && parseFloat(gravity) || 0.0;
        this.animationTime = Overview.ANIMATION_TIME * 1000;
        this.animationEffect = 'easeOutQuad';
		this._signals = new dbFinSignals.dbFinSignals();
        this._childrenObjects = new dbFinArrayHash.dbFinArrayHash();

		this.container = this._panelName	? new Shell.GenericContainer({ name: this._panelName, reactive: true, visible: true })
        									: new Shell.GenericContainer({ reactive: true, visible: true });
        if (this.container) {
            this._signals.connectNoId({ emitter: this.container, signal: 'get-preferred-width',
                                        callback: this._getPreferredWidth, scope: this });
            this._signals.connectNoId({ emitter: this.container, signal: 'get-preferred-height',
                                        callback: this._getPreferredHeight, scope: this });
            this._signals.connectNoId({ emitter: this.container, signal: 'allocate',
                                        callback: this._allocate, scope: this });
        }

		this.actor = this._boxName  ? new St.BoxLayout({ name: this._boxName, vertical: false, reactive: true, track_hover: true, visible: true })
                                    : new St.BoxLayout({ vertical: false, reactive: true, track_hover: true, visible: true });

		if (this.container && this.actor) {
            this.container.add_actor(this.actor);
            this.container._box = this.actor;
        }

		this.hidden = false;
		if (hidden || (autohideinoverview && Main.overview && Main.overview.visible)) this.hide();

        if (this._parent) {
            if (this._parentProperty) {
                this._parent[this._parentProperty] = this.container;
            }
            if (this._parent.add_actor) {
                this._parent.add_actor(this.container);
            }
            else if (this._parent.actor && this._parent.actor.add_actor) {
                this._parent.actor.add_actor(this.container);
            }
        }

		if (autohideinoverview) {
			this._signals.connectNoId({	emitter: Main.overview, signal: 'showing',
										callback: function () { this.hide(); }, scope: this });
			this._signals.connectNoId({	emitter: Main.overview, signal: 'hiding',
										callback: function () { this.show(); }, scope: this });
		}
        _D('<');
    },

	destroy: function() {
        _D('>' + this.__name__ + '.destroy()');
		if (this._signals) {
			this._signals.destroy();
			this._signals = null;
		}
		if (this.container) {
            if (this._parent) {
                if (this._parentProperty && this._parent[this._parentProperty] == this.container) {
                    this._parent[this._parentProperty] = null;
                }
                if (this._parent.remove_actor) {
                    this._parent.remove_actor(this.container);
                }
                else if (this._parent.actor && this._parent.actor.remove_actor) {
                    this._parent.actor.remove_actor(this.container);
                }
            }
            // just in case parent was not set up initially or was changed
            let (parent = this.container.get_parent && this.container.get_parent()) {
                if (parent && parent.remove_actor) {
                    parent.remove_actor(this.container);
                }
            }
		}
        if (this._childrenObjects) {
            this._childrenObjects.forEach(Lang.bind(this, function(childObject, signalId) { this.remove(childObject); }));
        }
		if (this.actor) {
			if (this.container) {
                this.container.remove_actor(this.actor);
                this.container._box = null;
            }
			this.actor.destroy();
			this.actor = null;
		}
		if (this.container) {
			this.container.destroy();
			this.container = null;
		}
        this.hidden = true;
        this._parent = null;
        this.emit('destroy');
        _D('<');
	},

    _getPreferredWidth: function(actor, forHeight, alloc) {
        _D('@' + this.__name__ + '._getPreferredWidth()');
		[ alloc.min_size, alloc.natural_size ] = this.actor.get_preferred_width(forHeight);
        _D('<');
    },

    _getPreferredHeight: function(actor, forWidth, alloc) {
        _D('@' + this.__name__ + '._getPreferredHeight()');
		[ alloc.min_size, alloc.natural_size ] = this.actor.get_preferred_height(forWidth);
        _D('<');
    },

    _allocate: function(actor, box, flags) {
        _D('@' + this.__name__ + '._allocate()');
        let (	w = box.x2 - box.x1,
                h = box.y2 - box.y1,
                x = box.x1,
                y = box.y1,
            	[ wm, wn ] = this.actor.get_preferred_width(-1),
                [ hm, hn ] = this.actor.get_preferred_height(-1),
                boxChild = new Clutter.ActorBox()) {
            if (wn < w) x += dbFinUtils.inRange(Math.floor(w * this._gravity - wn / 2), 0, w - wn);
            dbFinUtils.setBox(boxChild, x, y, Math.min(box.x2, x + wn), Math.min(box.y2, y + hn));
            this.actor.allocate(boxChild, flags);
        } // let (w, h, x, y, [ wm, wn ], [ hm, hn ], boxChild)
        _D('<');
    },

    add: function(childObject) {
        _D('>' + this.__name__ + '.add()');
        if (childObject && this._childrenObjects.get(childObject) === undefined) {
            let (actor = childObject.container || childObject.actor || childObject) {
                if (actor instanceof Clutter.Actor) this.actor.add_actor(actor);
            }
            this._childrenObjects.set(childObject, childObject.connect('destroy', Lang.bind(this, this.remove)));
        }
        _D('<');
    },

    remove: function(childObject) {
        _D('>' + this.__name__ + '.remove()');
        if (childObject) {
            let (signalId = this._childrenObjects.remove(childObject)) {
                if (signalId !== undefined) {
                    let (actor = childObject.container || childObject.actor || childObject) {
                        if (actor.get_parent && actor.get_parent() == this.actor) this.actor.remove_actor(actor);
                    }
                    childObject.disconnect(signalId);
                }
            }
        }
        _D('<');
    },

    show: function(time) {
        _D('>' + this.__name__ + '.show()');
        if (Main.screenShield.locked) {
            _D('<');
            return;
        }
        if (this.container) {
            this.container.show();
            this.container.reactive = true;
        }
        this.hidden = false;
        if (this._hideChildren && this._childrenObjects) {
            this._childrenObjects.forEach(function (childObject, signalId) {
                if (childObject.show) childObject.show(time === undefined || time === null ? this.animationTime : time);
            });
        }
		this.animateToState({ opacity: 255 }, null, null, time);
        _D('<');
    },

    hide: function(time) {
        _D('>' + this.__name__ + '.hide()');
        if (this.container) {
            this.container.reactive = false;
        }
        if (this._hideChildren && this._childrenObjects) {
            this._childrenObjects.forEach(function (childObject, signalId) {
                if (childObject.hide) childObject.hide(time === undefined || time === null ? this.animationTime : time);
            });
        }
		this.animateToState({ opacity: 0 }, function() {
			if (this.container) this.container.hide(); this.hidden = true;
		}, this, time);
        _D('<');
    },

    // animatable properties
    get gravity() { return this._gravity; },
    set gravity(gravity) {  this._gravity = gravity && parseFloat(gravity) || 0.0;
                            if (this.container) this.container.queue_relayout(); },
	get opacity() { return this.container.opacity; },
	set opacity(opacity) { this.container.opacity = opacity; },

    animateToState: function(state, callback, scope, time, transition) {
        _D('>' + this.__name__ + '.animateToState()');
		if (time === undefined || time === null) time = this.animationTime;
		if (transition === undefined || transition === null) {
			transition = this.animationEffect;
		}
		dbFinAnimation.animateToState(this, state, callback, scope, time, transition);
        _D('<');
    }
});
Signals.addSignalMethods(dbFinYAWLPanel.prototype);
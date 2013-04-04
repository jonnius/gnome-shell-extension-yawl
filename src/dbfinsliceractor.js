/* -*- mode: js2; js2-basic-offset: 4; c-basic-offset: 4; tab-width: 4; indent-tabs-mode: nil -*-  */
/*
 * YAWL (Yet Another Window List) Gnome-Shell Extension
 * Copyright (C) 2013 Vadim @ dbFin <vadim@dbfin.com>
 * You should have received a copy of the License along with this program.
 *
 * dbfinsliceractor.js
 * Slicer Actor: Actor in Slicer with animated change of state.
 *
 */

const Lang = imports.lang;
const Signals = imports.signals;

const Clutter = imports.gi.Clutter;
const Shell = imports.gi.Shell;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const dbFinAnimation = Me.imports.dbfinanimation;
const dbFinSignals = Me.imports.dbfinsignals;
const dbFinUtils = Me.imports.dbfinutils;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const _D = Me.imports.dbfindebug._D;

const dbFinSlicerActor = new Lang.Class({
	Name: 'dbFin.SlicerActor',

    _init: function(actor) { // actor must be destroyed by the descendant class
        _D('>' + this.__name__ + '._init()');
        this._signals = new dbFinSignals.dbFinSignals();

		this.container = new Shell.Slicer({ y_expand: true, pivot_point: new Clutter.Point({ x: 0.5, y: 0.5 }), visible: true });
        if (this.container) {
            this.container._delegate = this;
            this._signals.connectNoId({	emitter: this.container, signal: 'notify::allocation',
                                        callback: this._updateAllocation, scope: this });
        }

        this.actor = actor || null;
        if (this.actor) {
            this.actor._delegate = this;
            if (this.container) this.container.set_child(this.actor);
            this._signals.connectNoId({	emitter: this.actor, signal: 'enter-event',
										callback: this._hoverEnter, scope: this });
            this._signals.connectNoId({	emitter: this.actor, signal: 'leave-event',
										callback: this._hoverLeave, scope: this });
        }

		this.hidden = false;
		this.hiding = false;

		this._clipTop = 0; // px
		this._clipBottom = 0; // px
		this._paddingH = 0; // %
        this._paddingTop = 0; // px
        this._paddingBottom = 0; // px
        this._opacity = 255;

        this.animationTime = 0;
        this.animationEffect = 0;
        this.hoverAnimation = false;
        this._hoverOpacity = 255;
        this.hoverScale = 1.;
        this.hoverFit = false;
		this.hoverAnimationTime = 100; // as percentage of this.animationTime
        this.hoverAnimationEffect = 0;
        _D('<');
    },

	destroy: function() {
        _D('>' + this.__name__ + '.destroy()');
        if (this._signals) {
            this._signals.destroy();
            this._signals = null;
        }
		if (this.container) {
			this.container.set_child(null);
            let (parent = this.container.get_parent && this.container.get_parent()) {
                if (parent && parent.remove_actor) parent.remove_actor(this.container);
            }
			this.container.destroy();
			this.container = null;
		}
		this.actor = null;
		this.hidden = true;
        this.hiding = false;
		this.emit('destroy');
        _D('<');
	},

	show: function(time, callback, scope) {
        _D('>' + this.__name__ + '.show()');
		if (this.container) {
			this.container.show();
			this.container.reactive = true;
		}
        if (!this.hidden && !this.hiding) {
            _D('<');
            return;
        }
		this.hidden = false;
        this.hiding = false;
        this.animateToState({ opacity: 255, natural_width: this.getNaturalWidth() }, callback, scope, time);
        _D('<');
	},

    hide: function(time, callback, scope) {
        _D('>' + this.__name__ + '.hide()');
		if (!this.hidden && !this.hiding && this.container) {
            this.hiding = true;
            this.animateToState({ opacity: 0, natural_width: 0 },
                                function () {
                                    if (this.container) {
                                        this.container.reactive = false;
                                        this.container.hide();
                                    }
                                    this.hidden = true;
                                    this.hiding = false;
                                    if (callback) {
                                        if (scope) Lang.bind(scope, callback)();
                                        else callback();
                                    }
                                },
                                this,
                                time);
        }
        _D('<');
    },

	setClipTop: function(clip) {
        _D('>' + this.__name__ + '.setClipTop()');
		if (clip !== undefined && this._clipTop != clip) {
			this._clipTop = clip;
			this._updateAllocation();
		}
        _D('<');
	},

	setClipBottom: function(clip) {
        _D('>' + this.__name__ + '.setClipBottom()');
		if (clip !== undefined && this._clipBottom != clip) {
			this._clipBottom = clip;
			this._updateAllocation();
		}
        _D('<');
	},

	setPaddingH: function(padding) {
        _D('>' + this.__name__ + '.setPaddingH()');
		if (padding !== undefined && this._paddingH != padding) {
			this._paddingH = padding;
			this.restoreNaturalSize();
		}
        _D('<');
	},

	setPaddingTop: function(padding) {
        _D('>' + this.__name__ + '.setPaddingTop()');
		if (padding !== undefined && this._paddingTop != padding) {
			this._paddingTop = padding;
			if (this.actor) this.actor.set_style('padding-top: ' + this._paddingTop + 'px;'
		                                         + ' padding-bottom: ' + this._paddingBottom + 'px;');
			this.restoreNaturalSize();
		}
        _D('<');
	},

	setPaddingBottom: function(padding) {
        _D('>' + this.__name__ + '.setPaddingBottom()');
		if (padding !== undefined && this._paddingBottom != padding) {
			this._paddingBottom = padding;
			if (this.actor) this.actor.set_style('padding-top: ' + this._paddingTop + 'px;'
		                                         + ' padding-bottom: ' + this._paddingBottom + 'px;');
			this.restoreNaturalSize();
		}
        _D('<');
	},

    setOpacity: function(opacity) {
        _D('>' + this.__name__ + '.setOpacity()');
        opacity = dbFinUtils.inRange(opacity, 0, 255, undefined);
        if (opacity !== undefined && this._opacity != opacity) {
            this._opacity = opacity;
    		this.animateActorToState({ opacity: opacity });
        }
        _D('<');
    },

    setOpacity100: function(opacity) {
        _D('>' + this.__name__ + '.setOpacity100()');
        opacity = dbFinUtils.opacity100to255(dbFinUtils.inRange(opacity, 0, 100, undefined));
        if (opacity !== undefined && this._opacity != opacity) {
            this._opacity = opacity;
    		this.animateActorToState({ opacity: opacity });
        }
        _D('<');
    },

    setHoverOpacity: function(opacity) {
        _D('>' + this.__name__ + '.setHoverOpacity()');
        opacity = dbFinUtils.inRange(opacity, 0, 255, undefined);
        if (opacity !== undefined && this._hoverOpacity != opacity) {
            this._hoverOpacity = opacity;
        }
        _D('<');
    },

    setHoverOpacity100: function(opacity) {
        _D('>' + this.__name__ + '.setHoverOpacity100()');
        opacity = dbFinUtils.opacity100to255(dbFinUtils.inRange(opacity, 0, 100, undefined));
        if (opacity !== undefined && this._hoverOpacity != opacity) {
            this._hoverOpacity = opacity;
        }
        _D('<');
    },

    getNaturalWidth: function() {
        _D('>' + this.__name__ + '.getNaturalWidth()');
		let (wn = this.actor && this.actor.get_stage() ? this.actor.get_preferred_width(-1)[1] : 0) {
            wn = wn || 0;
            if (wn > 0 && this._paddingH && this._paddingH > 0) {
                wn += 2 * Math.max(1, Math.round(wn * this._paddingH / 100.));
            }
	        _D('<');
            return Math.max(wn, this.container.min_width);
		}
    },

    getNaturalHeight: function() {
        _D('>' + this.__name__ + '.getNaturalHeight()');
		let (hn = this.actor && this.actor.get_stage() ? this.actor.get_preferred_height(-1)[1] : 0) {
            hn = hn || 0;
	        _D('<');
            return Math.max(hn, this.container.min_height);
		}
    },

    restoreNaturalSize: function() {
        _D('>' + this.__name__ + '.restoreNaturalSize()');
		this.animateToState({ natural_width: this.getNaturalWidth(), natural_height: this.getNaturalHeight() });
        _D('<');
	},

	_updateAllocation: function() {
        _D('>' + this.__name__ + '._updateAllocation()');
        let (allocation = this.container.allocation) {
			if (this._clipTop > 0 || this._clipBottom > 0) {
				this.container.set_clip(0, Math.min(allocation.y2 - allocation.y1, this._clipTop),
				                       allocation.x2 - allocation.x1,
				                       Math.max(0, allocation.y2 - allocation.y1 - this._clipTop - this._clipBottom));
			}
			else {
				this.container.remove_clip();
			}
		} // let (allocation)
        _D('<');
	},

	_hoverEnter: function() {
        _D('>' + this.__name__ + '._hoverEnter()');
		if (this.hoverAnimation && !this.hidden && !this.hiding) {
			let (state = {},
                 time = Math.round(this.animationTime * this.hoverAnimationTime / 100)) {
				if (this.hoverScale) state.scale_x = state.scale_y = this.hoverScale;
				if (this.hoverFit) state.min_width = this.getNaturalWidth();
				this.animateToState(state, null, null, time, this.hoverAnimationEffect);
                this.animateActorToState({ opacity: this._hoverOpacity }, null, null, time, this.hoverAnimationEffect);
			}
		}
        _D('<');
	},

	_hoverLeave: function() {
        _D('>' + this.__name__ + '._hoverLeave()');
        let (state = {},
             time = Math.round(this.animationTime * this.hoverAnimationTime / 100)) {
            state.scale_x = state.scale_y = 1.;
            state.min_width = 0;
            this.animateToState(state, null, null, time, this.hoverAnimationEffect);
            this.animateActorToState({ opacity: this._opacity }, null, null, time, this.hoverAnimationEffect);
        }
        _D('<');
	},

	animateToState: function(state, callback, scope, time, transition) {
        _D('>' + this.__name__ + '.animateToState()');
		if (time === undefined || time === null) time = this.animationTime;
		if (transition === undefined || transition === null) {
			transition = this.animationEffect;
		}
		dbFinAnimation.animateToState(this.container, state, callback, scope, time, transition);
        _D('<');
	},

	animateActorToState: function(state, callback, scope, time, transition) {
        _D('>' + this.__name__ + '.animateActorToState()');
		if (time === undefined || time === null) time = this.animationTime;
		if (transition === undefined || transition === null) {
			transition = this.animationEffect;
		}
		dbFinAnimation.animateToState(this.actor, state, callback, scope, time, transition);
        _D('<');
	}
});
Signals.addSignalMethods(dbFinSlicerActor.prototype);
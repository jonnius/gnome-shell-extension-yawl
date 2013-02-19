/* -*- mode: js2; js2-basic-offset: 4; c-basic-offset: 4; tab-width: 4; indent-tabs-mode: nil -*-  */
/*
 * YAWL (Yet Another Window List) Gnome-Shell Extension
 * Copyright (C) 2013 Vadim @ dbFin <vadim@dbfin.com>
 * You should have received a copy of the License along with this program.
 *
 * dbfinmovecenter.js
 * Move central panel to the right.
 *
 */

const Lang = imports.lang;

const Clutter = imports.gi.Clutter;

const Main = imports.ui.main;
const Panel = imports.ui.panel;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const dbFinUtils = Me.imports.dbfinutils;
const Convenience = Me.imports.convenience2;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const _D = Me.imports.dbfindebug._D;

// GNOMENEXT: ui/panel.js: class ActivitiesButton
const dbFinHotCorner = new Lang.Class({
	Name: 'dbFin.HotCorner',

    _init: function() {
        _D('>dbFinHotCorner._init()');
		this._button = new Panel.ActivitiesButton();
		this._signals = new dbFinUtils.Signals();
		this._signals.connectNoId({ emitter: this._button.actor, signal: 'get-preferred-width',
									callback: this._getPreferredSize, scope: this });
		this._signals.connectNoId({ emitter: this._button.actor, signal: 'get-preferred-height',
									callback: this._getPreferredSize, scope: this });
		this._signals.connectNoId({ emitter: this._button.actor, signal: 'allocate',
									callback: this._allocate, scope: this });
		Main.panel['_leftBox'].insert_child_at_index(this._button.container, 0);
        _D('<');
    },

	destroy: function() {
        _D('>dbFinHotCorner.destroy()');
		if (this._signals) {
			this._signals.destroy(); // This should disconnect all signals
			this._signals = null;
		}
		if (this._button) {
			Main.panel['_leftBox'].remove_actor(this._button.container);
			this._button.destroy();
			this._button = null;
		}
        _D('<');
	},

	_getPreferredSize: function(actor, forSize, alloc) {
        _D('@dbFinHotCorner._getPreferredSize()'); // This is called whenever GS needs to reallocate the button, debug will cause lots of records
		[ alloc.min_size, alloc.natural_size ] = [ 4, 4 ]; // for some reason smaller values generate lots of GS warnings
		_D('<');
	},

	_allocate: function(actor, box, flags) {
        _D('@dbFinHotCorner._allocate()'); // This is called whenever GS needs to reallocate the button, debug will cause lots of records
		let (	children = actor.get_children(),
		    	childBox = new Clutter.ActorBox()) {
			if (children.length) {
				dbFinUtils.setBox(childBox, 0, 0, 1, 1);
				children[0].allocate(childBox, flags);
			}
		} // let (childBox)
		_D('<');
	}
});

const dbFinMoveCenter = new Lang.Class({
    Name: 'dbFin.MoveCenter',

    _init: function() {
        _D('>dbFinMoveCenter._init()');
        this._settings = Convenience.getSettings();
		this._signals = new dbFinUtils.Signals();
		this._panelbuttonstoggle = new dbFinUtils.PanelButtonToggle();
		this._hotcorner = null;
		this._signals.connectNoId({ emitter: Main.panel.actor, signal: 'allocate',
									callback: this._allocate, scope: this });
        this._updatePanel();
        this._hideActivities();
		this._signals.connectNoId({ emitter: this._settings, signal: 'changed::yawl-panel-position',
                                    callback: this._updatePanel, scope: this });
		this._signals.connectNoId({ emitter: this._settings, signal: 'changed::move-center',
                                    callback: this._updatePanel, scope: this });
		this._signals.connectNoId({ emitter: this._settings, signal: 'changed::hide-activities',
                                    callback: this._hideActivities, scope: this });
		this._signals.connectNoId({ emitter: this._settings, signal: 'changed::preserve-hot-corner',
                                    callback: this._hideActivities, scope: this });
        _D('<');
    },

    destroy: function() {
        _D('>dbFinMoveCenter.destroy()');
        if (this._signals) {
            this._signals.destroy(); // this should disconnect everything and move central panel back
            this._signals = null;
            this._updatePanel();
        }
		if (this._hotcorner) {
			this._hotcorner.destroy();
			this._hotcorner = null;
		}
        if (this._panelbuttonstoggle) {
            this._panelbuttonstoggle.destroy(); // this should restore Activities button
            this._panelbuttonstoggle = null;
        }
        this._settings = null;
        _D('<');
    },

    _hideActivities: function() {
        _D('>dbFinMoveCenter._hideActivities()');
		let (hide = this._settings.get_boolean('hide-activities')) {
			let (corner = hide && this._settings.get_boolean('preserve-hot-corner')) {
				if (corner) {
					if (!this._hotcorner) this._hotcorner = new dbFinHotCorner();
				}
				else {
					if (this._hotcorner) {
						this._hotcorner.destroy();
						this._hotcorner = null;
					}
				}
			} // let (corner)
			if (hide) this._panelbuttonstoggle.hide('activities', 'left');
			else this._panelbuttonstoggle.restore('activities');
		} // let (hide)
        _D('<');
    },

	// GNOMENEXT: ui/panel.js: class Panel
	_updatePanel: function() {
        _D('>dbFinMoveCenter._updatePanel()');
		Main.panel._updatePanel();
        _D('<');
	},

	// GNOMENEXT: modified from ui/panel.js: class Panel
    _allocate: function (actor, box, flags) {
        _D('@dbFinMoveCenter._allocate()'); // This is called whenever GS needs to reallocate the panel, debug will cause lots of records
		let (   w = box.x2 - box.x1, // what do we have?
                h = box.y2 - box.y1,
                [wlm, wln] = Main.panel._leftBox.get_preferred_width(-1), // minimum and natural widths
                [wcm, wcn] = Main.panel._centerBox.get_preferred_width(-1),
                [wrm, wrn] = Main.panel._rightBox.get_preferred_width(-1),
                boxChild = new Clutter.ActorBox(),
                drl = (Main.panel.actor.get_text_direction() == Clutter.TextDirection.RTL)) {
			let (wly, wl, wy, wr, xl, xr) {
				if (this._settings.get_boolean('move-center')) {
					// let left box + YAWL panel occupy all the space on the left, but no less than (w - wcn) / 2
					// let right box occupy as much as it needs on the right, but no more than (w - wcn) / 2
					wly = Math.max(w - wcn - wrn, Math.ceil((w - wcn) / 2));
					wr = Math.min(wrn, Math.floor((w - wcn) / 2));
				}
				else {
					wly = Math.ceil((w - wcn) / 2);
					wr = Math.floor((w - wcn) / 2);
				}
				wl = Math.min(Math.max(wlm, Math.floor(w * parseInt(this._settings.get_string('yawl-panel-position')) / 100.)), wly - 42);
				wy = wly - wl;
				xl = (drl ? w - wl : 0);
				xr = xl + wl;
				dbFinUtils.setBox(boxChild, xl, 0, xr, h);
				Main.panel._leftBox.allocate(boxChild, flags);
				if (drl) { xr = xl; xl -= wy; } else { xl = xr; xr += wy; }
				dbFinUtils.setBox(boxChild, xl, 0, xr, h);
				if (Main.panel._yawlBox) Main.panel._yawlBox.allocate(boxChild, flags);
				if (drl) { xr = xl; xl -= wcn; } else { xl = xr; xr += wcn; }
				dbFinUtils.setBox(boxChild, xl, 0, xr, h);
				Main.panel._centerBox.allocate(boxChild, flags);
				if (drl) { xr = Math.min(wrn, xl); xl = 0; } else { xl = Math.max(w - wrn, xr); xr = w; }
				dbFinUtils.setBox(boxChild, xl, 0, xr, h);
				Main.panel._rightBox.allocate(boxChild, flags);
				// Who needs the corners?.. Well, maybe someone does.
				// But we do not need to reallocate them
			} // let (wly, wl, wy, wr, xl, xr)
		} // let (w, h, wlm, wln, wcm, wcn, wrm, wrn, boxChild, drl)
        _D('<');
    }
});

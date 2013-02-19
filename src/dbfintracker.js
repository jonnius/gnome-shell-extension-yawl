/* -*- mode: js2; js2-basic-offset: 4; c-basic-offset: 4; tab-width: 4; indent-tabs-mode: nil -*-  */
/*
 * YAWL (Yet Another Window List) Gnome-Shell Extension
 * Copyright (C) 2013 Vadim @ dbFin <vadim@dbfin.com>
 * You should have received a copy of the License along with this program.
 *
 * dbfintracker.js
 * Main class to track apps and windows on current workspace.
 *
 */

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Shell = imports.gi.Shell;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const dbFinUtils = Me.imports.dbfinutils;
const Convenience = Me.imports.convenience2;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const _D = Me.imports.dbfindebug._D;

/* class dbFinTrackerApp: all stuff associated with an app
 */
const dbFinTrackerApp = new Lang.Class({
	Name: 'dbFin.TrackerApp',

    _init: function(metaApp, tracker, metaWindow) {
        _D('>dbFinTrackerApp._init()');
		this.metaApp = metaApp;
		this._tracker = tracker;
        this.windows = (metaWindow ? [ metaWindow ] : []);
        _D('<');
    },

	destroy: function() {
        _D('>dbFinTrackerApp.destroy()');
		this.metaApp = null;
		this._tracker = null;
        this.windows = [];
        _D('<');
	},

    addWindow: function(metaWindow) {
        _D('>dbFinTrackerApp.addWindow()');
        if (metaWindow && this.windows.indexOf(metaWindow) == -1) this.windows.push(metaWindow);
        _D('<');
    },

    removeWindow: function(metaWindow) {
        _D('>dbFinTrackerApp.removeWindow()');
        if (metaWindow) {
            let (i = this.windows.indexOf(metaWindow)) {
                if (i != -1) this.windows.splice(i, 1);
            }
        }
        _D('<');
    }
});

/* class dbFinTrackerWindow: all stuff associated with a window
 */
const dbFinTrackerWindow = new Lang.Class({
	Name: 'dbFin.TrackerWindow',

    _init: function(metaWindow, tracker, metaApp) {
        _D('>dbFinTrackerWindow._init()');
        this.metaWindow = metaWindow;
		this._tracker = tracker;
		this.windowtitle = '?';
		this._updateTitle();
        this.app = metaApp;
		this.appname = '?';
		if (this.app && this.app.get_name) {
			try { this.appname = this.app.get_name(); } catch (e) { this.appname = '?'; }
		}
        this._signals = new dbFinUtils.Signals();
        this._signals.connectNoId({ emitter: this.metaWindow, signal: 'notify::title',
                                    callback: this._titleChanged, scope: this });
        _D('<');
    },

	destroy: function() {
        _D('>dbFinTrackerWindow.destroy()');
        if (this._signals) {
            this._signals.destroy();
            this._signals = null;
        }
        this.metaWindow = null;
		this._tracker = null;
		this.windowtitle = '?';
        this.app = null;
		this.appname = '?';
        _D('<');
	},

	_titleChanged: function(metaWindow) {
        _D('>dbFinTrackerWindow._titleChanged()');
		if (metaWindow != this.metaWindow) {
	        _D('<');
			return;
		}
		let (msg = '"' + this.appname + ':' + this.windowtitle + '" changed title to "') {
			this._updateTitle();
			if (this._tracker) this._tracker.update(null, msg + this.windowtitle + '".');
		}
        _D('<');
	},

	_updateTitle: function() {
        _D('>dbFinTrackerWindow._updateTitle()');
		if (this.metaWindow && this.metaWindow.get_title) {
			try { this.windowtitle = this.metaWindow.get_title(); } catch (e) { this.windowtitle = '?'; }
		}
        _D('<');
	},
});

/* class dbFinTracker: main class to track all apps and windows
 */
const dbFinTracker = new Lang.Class({
	Name: 'dbFin.Tracker',

    _init: function(callback) { // callback: function(appsIn, appsOut, windowsIn, windowsOut) called by update (_refresh)
        _D('>dbFinTracker._init()');
		this._signals = new dbFinUtils.Signals();
		this._callback = callback || null;
		this.apps = new dbFinUtils.ArrayHash(); // [ [ metaApp, { state:, trackerApp: } ] ]
		this.windows = new dbFinUtils.ArrayHash(); // [ [ metaWindow, { state:, trackerWindow: } ] ]
		this.state = 0; // when refreshing we increase the state to indicate apps and windows that are no longer there
        this.stateInfo = '';
		this.update(null, 'Tracker: initial update.');
		this._signals.connectNoId({	emitter: global.window_manager, signal: 'switch-workspace',
									callback: this._switchWorkspace, scope: this });
        _D('<');
    },

	destroy: function() {
        _D('>dbFinTracker.destroy()');
		if (this._signals) {
			this._signals.destroy();
			this._signals = null;
		}
		this._callback = null;
        this.state++;
		if (this.apps) {
			this.apps.forEach(Lang.bind(this, function(metaApp, appProperties) {
				if (appProperties) {
					if (appProperties.trackerApp) appProperties.trackerApp.destroy();
					appProperties.trackerApp = null;
				}
			}));
			this.apps.destroy();
			this.apps = null;
		}
		if (this.windows) {
			this.windows.forEach(Lang.bind(this, function(metaWindow, windowProperties) {
				if (windowProperties) {
					if (windowProperties.trackerWindow) windowProperties.trackerWindow.destroy();
					windowProperties.trackerWindow = null;
				}
			}));
			this.windows.destroy();
			this.windows = null;
		}
        _D('<');
	},

	getTrackerApp: function(metaApp) {
        _D('>dbFinTracker.getTrackerApp()');
		let (appProperties = this.apps.get(metaApp)) {
			if (appProperties !== undefined && appProperties && appProperties.trackerApp) {
		        _D('<');
				return appProperties.trackerApp;
			}
			else {
                _D(appProperties ? 'appProperties.trackerApp === null' : 'appProperties === null');
		        _D('<');
				return null;
			}
		} // let (appProperties)
	},

	getTrackerWindow: function(metaWindow) {
        _D('>dbFinTracker.getTrackerWindow()');
		let (windowProperties = this.windows.get(metaWindow)) {
			if (windowProperties !== undefined && windowProperties && windowProperties.trackerWindow) {
		        _D('<');
				return windowProperties.trackerWindow;
			}
			else {
                _D(windowProperties ? 'windowProperties.trackerWindow === null' : 'windowProperties === null');
		        _D('<');
				return null;
			}
		} // let (windowProperties)
	},

	_refresh: function(metaWorkspace/* = global.screen.get_active_workspace()*/, stateInfo/* = '_refresh() call with no additional info.'*/) {
        _D('@dbFinTracker._refresh()'); // This is called whenever tracker needs to refresh, debug will cause lots of records
		if (!this.apps || !this.windows) {
			_D(!this.apps ? 'this.apps == null' : 'this.windows == null');
	        _D('<');
			return;
		}
		if (!metaWorkspace || !metaWorkspace.list_windows) {
			metaWorkspace = global.screen.get_active_workspace();
		}
		if (this._signals) {
	        this._signals.disconnectId('tracker-window-added');
	        this._signals.disconnectId('tracker-window-removed');
		}
		this.state ? this.state++ : (this.state = 1);
        this.stateInfo = (!stateInfo || stateInfo == '' ? '_refresh() call with no additional info.' : stateInfo);
		let (appsIn = [], appsOut = [], windowsIn = [], windowsOut = [], tracker = Shell.WindowTracker.get_default()) {
			metaWorkspace.list_windows().forEach(Lang.bind(this, function(metaWindow) {
				if (!metaWindow || !tracker.is_window_interesting(metaWindow)) return;
				let (metaApp = tracker.get_window_app(metaWindow)) {
					if (!metaApp || metaApp.state == Shell.AppState.STOPPED) return;
					let (	windowProperties = this.windows.get(metaWindow),
							appProperties = this.apps.get(metaApp)) {
						if (windowProperties === undefined || !windowProperties) { // new window
							windowsIn.push(metaWindow);
							windowProperties = {};
							windowProperties.trackerWindow = new dbFinTrackerWindow(metaWindow, this, metaApp);
							if (appProperties !== undefined && appProperties && appProperties.trackerApp) {
								appProperties.trackerApp.addWindow(metaWindow);
							}
						}
						if (appProperties === undefined || !appProperties || !appProperties.trackerApp) { // new app
							appsIn.push(metaApp);
							appProperties = {};
							appProperties.trackerApp = new dbFinTrackerApp(metaApp, this, metaWindow);
						}
						windowProperties.state = this.state;
						this.windows.set(metaWindow, windowProperties);
						appProperties.state = this.state;
						this.apps.set(metaApp, appProperties);
					} // let (windowProperties, appProperties)
				} // let (metaApp)
			})); // metaWorkspace.list_windows().forEach
			[ appsOut, windowsOut ] = this._clean();
			if (this._signals) {
				this._signals.connectId('tracker-window-added', {	emitter: metaWorkspace, signal: 'window-added',
																	callback: this._windowAdded, scope: this },
										/*after = */true);
				this._signals.connectId('tracker-window-removed', {	emitter: metaWorkspace, signal: 'window-removed',
																	callback: this._windowRemoved, scope: this },
										/*after = */true);
			}
            if (this._callback) this._callback(appsIn, appsOut, windowsIn, windowsOut);
		} // let (appsIn, appsOut, windowsIn, windowsOut, tracker)
        _D('<');
	},

	_clean: function() { // returns [ appsOut, windowsOut ]
        _D('>dbFinTracker._clean()');
		if (!this.apps || !this.windows) {
			_D(!this.apps ? 'this.apps == null' : 'this.windows == null');
	        _D('<');
			return [ [], [] ];
		}
		let (appsOut = [], windowsOut = []) {
			this.apps.forEach(Lang.bind(this, function (metaApp, appProperties) {
				if (!appProperties || !appProperties.state || appProperties.state < this.state
					    || !appProperties.trackerApp || !appProperties.trackerApp.windows || !appProperties.trackerApp.windows.length) {
					if (appProperties && appProperties.trackerApp && appProperties.trackerApp.windows) {
						appProperties.trackerApp.windows.forEach(Lang.bind(this, function (metaWindow) { windowsOut.push(metaWindow); }));
					}
					appsOut.push(metaApp);
					this._removeApp(metaApp);
				}
			})); // this.apps.forEach
			this.windows.forEach(Lang.bind(this, function (metaWindow, windowProperties) {
				if (!windowProperties || !windowProperties.state || windowProperties.state < this.state
				        || !windowProperties.trackerWindow || !windowProperties.trackerWindow.app) {
					windowsOut.push(metaWindow);
					this._removeWindow(metaWindow);
				}
			})); // this.windows.forEach
			_D('<');
			return [ appsOut, windowsOut ];
		} // let (appsOut, windowsOut)
	},

	_removeApp: function(metaApp) { // calls _removeWindow if there are any windows belonging to app
        _D('>dbFinTracker._removeApp()');
		let (appProperties = this.apps.get(metaApp)) {
			if (appProperties === undefined || !appProperties) {
				_D('appProperties === null');
			}
			else if (appProperties.trackerApp && appProperties.trackerApp.windows && appProperties.trackerApp.windows.length) {
                let (windows = appProperties.trackerApp.windows.slice()) {
    				windows.forEach(Lang.bind(this, function (metaWindow) { this._removeWindow(metaWindow); }));
                }
			}
            else { // if (appProperties && (!appProperties.trackerApp || !appProperties.trackerApp.windows || !appProperties.trackerApp.windows.length))
                if (appProperties.trackerApp) {
                    appProperties.trackerApp.destroy();
                    appProperties.trackerApp = null;
                }
				this.apps.remove(metaApp);
            }
		} // let (appProperties)
        _D('<');
	},

	_removeWindow: function(metaWindow) { // calls _removeApp if no more windows belong to app
        _D('>dbFinTracker._removeWindow()');
		let (windowProperties = this.windows.remove(metaWindow)) {
			if (windowProperties === undefined || !windowProperties) {
				_D('windowProperties === null');
                _D('<');
                return;
			}
			if (windowProperties.trackerWindow) {
				let (metaApp = windowProperties.trackerWindow.app) {
					windowProperties.trackerWindow.destroy();
					windowProperties.trackerWindow = null;
					// this.windows.remove(metaWindow); // no need as we use remove instead of get above
					let (appProperties = this.apps.get(metaApp)) {
						if (appProperties !== undefined && appProperties) {
							if (appProperties.trackerApp) {
								appProperties.trackerApp.removeWindow(metaWindow);
							}
							if (!appProperties.trackerApp || !appProperties.trackerApp.windows || !appProperties.trackerApp.windows.length) {
								this._removeApp(metaApp);
							}
						} // if (appProperties !== undefined && appProperties)
					} // let (appProperties)
				} // let (metaApp)
			} // if (windowProperties.trackerWindow)
		} // let (windowProperties)
        _D('<');
	},

	update: function(metaWorkspace/* = null*/, stateInfo/* = 'update() call with no additional info.'*/) {
        _D('@dbFinTracker.update()'); // This is called whenever tracker needs to update, debug will cause lots of records
		metaWorkspace = metaWorkspace || null;
        if (!stateInfo || stateInfo == '') stateInfo = 'update() call with no additional info.';
		Mainloop.idle_add(Lang.bind(this, this._refresh, metaWorkspace, stateInfo));
        _D('<');
	},

	_switchWorkspace: function (manager, wsiOld, wsiNew) {
        _D('>dbFinTracker._switchWorkspace()');
		this.update(global.screen.get_workspace_by_index(wsiNew), 'Workspace switched from ' + (wsiOld + 1) + ' to ' + (wsiNew + 1) + '.');
        _D('<');
	},

	_windowAdded: function (metaWorkspace, metaWindow) {
        _D('>dbFinTracker._windowAdded()');
		this.update(null, 'A window was added to workspace ' + (metaWorkspace && metaWorkspace.index ? metaWorkspace.index() + 1 : '?') + '.');
        _D('<');
	},

	_windowRemoved: function (metaWorkspace, metaWindow) {
        _D('>dbFinTracker._windowRemoved()');
		let (windowProperties = this.windows.get(metaWindow)) {
			this.update(null, 'Window "'
			            + (windowProperties && windowProperties.trackerWindow
			            	? windowProperties.trackerWindow.appname + ':' + windowProperties.trackerWindow.windowtitle
			            	: '?:?')
			            + '" was removed from workspace '
			            + (metaWorkspace && metaWorkspace.index ? metaWorkspace.index() + 1 : '?') + '.');
		}
        _D('<');
	}
});

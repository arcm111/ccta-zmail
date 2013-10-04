qx.Class.define('zmail.data',
{
	type: 'singleton',
	extend: qx.core.Object,
	
	construct: function()
	{
		var data = ClientLib.Data.MainData.GetInstance();
		var mail = data.get_Mail();
		var root = this;
		var alliance = data.get_Alliance();
		var allianceExists = alliance.get_Exists();
		if(allianceExists)
		{
			var roles = alliance.get_Roles();
			var relations = alliance.get_Relationships();
			this.roles = roles;
			
			for (var i = 0; i < relations.length; i++)
			{
				var type = relations[i].Relationship, id = relations[i].OtherAllianceId, name = relations[i].OtherAllianceName;
				if (type == 1) this.getAllianceMembers(id, name);
			}
			this.getMembers();
		}

		var ownerName = data.get_Player().get_Name();
		var ownerId = data.get_Player().get_Id();
		this.ownerName = ownerName;
		this.ownerId = ownerId;
		
		var getPlayers = function(fi,li)
		{
			ClientLib.Net.CommunicationManager.GetInstance().SendSimpleCommand("RankingGetData", 
			{ 'ascending': true, 'firstIndex': fi, 'lastIndex': li, 'rankingType': 0, 'sortColumn': 2, 'view': 0 }, 
			phe.cnc.Util.createEventDelegate(ClientLib.Net.CommandResult, this, function(context, data)
			{
				if(data !== null) root.players = root.players.concat(data.p);
			}), null);
		};
		var getList = function(count)
		{
			var pages = Math.ceil(count/4500);
			for(var i = 0; i < pages; i++)
			{
				var min = i * 4500, max = Math.min((((i+1) * 4500) - 1), (count-1));
				getPlayers(min, max);
			}
		};
		ClientLib.Net.CommunicationManager.GetInstance().SendSimpleCommand("RankingGetCount", { 'rankingType': 0, 'view': 0 }, 
		phe.cnc.Util.createEventDelegate(ClientLib.Net.CommandResult, this, function(context, data)
		{
			if (data !== null) getList(data);
		}), null);
					
		if(typeof localStorage.ccta_zmail !== 'undefined')
		{
			var json = JSON.parse(localStorage.ccta_zmail);
			if(json.hasOwnProperty('archive')) this.archive = json.archive;
		}
		
		var inbox = {
			folder: null,
			count: mail.GetMailCount(0),
			messages: [],
			unRead: mail.GetUnreadCount(),
		};
		
		var outbox = {
			folder: null,
			count: mail.GetMailCount(1),
			messages: [],
		};
		
		var getFolder = function(type)
		{
			var gmh = mail.GetMailHeaders.toString();
			var prop = gmh.replace(/^.*?c=this\.(.*?)\.d\[a\].*?$/, '$1');
			var folder = mail[prop].d[type].i;
			return folder;
		}
		
		inbox.folder = getFolder(0);
		outbox.folder = getFolder(1);
		
		this.inbox = inbox;
		this.outbox = outbox;
		
		this.getMsgHeaders(inbox.folder, inbox.count, 0);
		this.getMsgHeaders(outbox.folder, outbox.count, 1);
		
		phe.cnc.Util.attachNetEvent(ClientLib.Data.MainData.GetInstance().get_Mail(), 'DataChange', ClientLib.Data.MailDataChange, this, this._onMailChange);
	},
	
	destruct: function(){},
	
	members: 
	{
		inbox: null,
		outbox: null,
		update: null,
		archive: {},
		inProgress: false,
		players: [],
		roles: null,
		allianceMembers: null,
		allianceCommanders: null,
		allies: {},
		ownerName: null,
		ownerId: null,
		
		call: function(fn)
		{
			var root = this;
			root[fn].apply(root, arguments);
		},
		
		update: function()
		{
			if(this.inProgress) return;
			this.inProgress = true;
			console.log('checking mails');
			var data = ClientLib.Data.MainData.GetInstance();
			var mail = data.get_Mail();
			var count = mail.GetUnreadCount();
			this.inbox.count = mail.GetMailCount(0);
			this.outbox.count = mail.GetMailCount(1);
			this.inbox.unRead = count;
			this.getMsgHeaders(this.inbox.folder, this.inbox.count, 0);
			this.getMsgHeaders(this.outbox.folder, this.outbox.count, 1);
		},
		
		markRead: function(id, flag)
		{
			ClientLib.Data.MainData.GetInstance().get_Mail().SetMailRead(id, flag);
		},
		
		deleteMsgs: function(id, folder)
		{
			ClientLib.Data.MainData.GetInstance().get_Mail().DeleteMessages(id, folder);
		},
		
		sendMail: function(to, alliance, subject, message)
		{
			ClientLib.Data.MainData.GetInstance().get_Mail().SendMail(to, alliance, subject, message);
		},
		
		createBBCode:
		{
			'coords': function(name,x,y)
			{
				return webfrontend.gui.util.BBCode.createCoordsLinkText(name,x,y).replace('#0d77bb', '#377395');
			},
			
			'player': function(name)
			{
				return webfrontend.gui.util.BBCode.createPlayerLinkText(name).replace('#0d77bb', '#377395');
			},
			
			'alliance': function(name)
			{
				return webfrontend.gui.util.BBCode.createAllianceLinkText(name).replace('#0d77bb', '#377395');
			}
		},
		
		getMembers: function()
		{
			ClientLib.Net.CommunicationManager.GetInstance().SendSimpleCommand("AllianceGetMemberData", {}, 
			phe.cnc.Util.createEventDelegate(ClientLib.Net.CommandResult, this, function(context, data)
			{
				var members = [], commanders = [];
				for (var i = 0; i < data.length; i++)
				{
					var name = data[i].n, id = data[i].i, roleId = data[i].r, role = this.roles.d[roleId].Name;
					switch(role)
					{
						case 'Leader': role = 'Commander-in-Cheif'; break;
						case 'Newbie': role = 'Trial'; break;
					}
					var member = {'id': id, 'name': name, 'role': role, 'roleId': roleId};
					if (role == 'Commander-in-Cheif' || role == 'Second Commander') commanders.push(member);
					members.push(member);
				}
				this.allianceMembers = members;
				this.allianceCommanders = commanders;
				var structure = zmail.structure.getInstance();
				structure.dom.leftBar.contacts.alliance.nodeValue = 'Alliance ' + members.length;
				structure.dom.leftBar.contacts.commanders.nodeValue = 'Commanders ' + commanders.length;
			}), null);
		},
		
		getAllianceMembers: function(aid, name)
		{
			ClientLib.Net.CommunicationManager.GetInstance().SendSimpleCommand("GetPublicAllianceMemberList", {'id': aid }, 
			phe.cnc.Util.createEventDelegate(ClientLib.Net.CommandResult, this, function(context, data)
			{
				this.allies[name] = data;
			}), null);
		},
		
		getMsgHeaders: function(id, count, type)
		{
			type == 0 ? this.inbox.messages = [] : this.outbox.messages = [];
			ClientLib.Net.CommunicationManager.GetInstance().SendSimpleCommand("IGMGetMsgHeader", { folder: id, ascending: false, skip: 0, take: count, sortColumn: 1 }, 
			phe.cnc.Util.createEventDelegate(ClientLib.Net.CommandResult, this, function(context, data)
			{
				for (var i = 0; i < data.length; i++) this.getMsgBody(data[i], type);
			}), null);
		},
		
		getMsgBody: function(msg, type)
		{
			if(this.archive.hasOwnProperty(msg.i))
			{
				if(this.archive[msg.i].r != msg.r) this.archive[msg.i].r = msg.r;
				type == 0 ? this.inbox.messages.push(this.archive[msg.i]) : this.outbox.messages.push(this.archive[msg.i]);
				this.onCompleted();
			}
			else
			{
				ClientLib.Net.CommunicationManager.GetInstance().SendSimpleCommand("IGMGetMsg", { mailId: msg.i }, 
				phe.cnc.Util.createEventDelegate(ClientLib.Net.CommandResult, this, function(context, data)
				{
					var cm = msg;
					cm.b = data;
					type == 0 ? this.inbox.messages.push(cm) : this.outbox.messages.push(cm);
					this.archive[msg.i] = cm;
					this.onCompleted();
				}), null);
			}
		},
		
		onCompleted: function()
		{
			var ti = this.inbox.count, to = this.outbox.count, ci = this.inbox.messages.length, co = this.outbox.messages.length;
			if(ti == ci && to == co)
			{
				var structure = zmail.structure.getInstance();
				structure.callUpdate(this.inbox.messages, this.outbox.messages);
				var json = JSON.parse(localStorage.ccta_zmail);
				json.archive = this.archive;
				localStorage.ccta_zmail = JSON.stringify(json);
				this.inProgress = false;
			}
		},
		
		_onMailChange: function()
		{
			var data = ClientLib.Data.MainData.GetInstance();
			var structure = zmail.structure.getInstance();
			var mail = data.get_Mail();
			var countInbox = mail.GetMailCount(0);
			var countOutbox = mail.GetMailCount(1);
			console.log('checking new messages');
			if(countInbox > this.inbox.count)
			{
				this.update();
				console.log('new message detected');
			}
			if(countOutbox > this.outbox.count)
			{
				this.update();
				console.log('message sent successfully');
			}
		}
	}
});

qx.Class.define('zmail.main',
{
	type: 'singleton',
	extend: qx.ui.container.Composite,
	
	construct: function()
	{
		this.base(arguments);
		var layout = new qx.ui.layout.Canvas();
		this._setLayout(layout);
		
		zmail.data.getInstance();
				
		var widget = new qx.ui.core.Widget();
		widget.setPadding(3);
		widget.setHeight(546);
		var div = new qx.html.Element('div', null, {'id': 'zdoom_mail_container'});
		widget.getContentElement().add(div);
		this.add(widget, {left: 0, top: 0});
		this.widget = widget;

		this.wdgAnchor = new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_tl1.png").set({ width: 3, height: 32 });
		this.__imgTopRightCorner = new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_tr.png").set({ width: 34, height: 35 });
		this.__backgroundTop = new qx.ui.basic.Image(null);
		var cntBackgroundTop = new qx.ui.container.Composite(new qx.ui.layout.Canvas()).set({ height: 132 , maxHeight: 132 });
		var cntBackgroundTopBackground = new qx.ui.container.Composite().set({ backgroundColor: "#000000" });
		cntBackgroundTop.add(cntBackgroundTopBackground, { left: 0, top: 0, right: 0, bottom: 0 });
		cntBackgroundTop.add(this.__backgroundTop, { left: 0, top: -10 });
		this.__background = new qx.ui.basic.Image(null);
		var cntBackground = new qx.ui.container.Composite(new qx.ui.layout.Canvas());
		cntBackground.add(this.__background, { left: 0, top: -10 });
		this._add(cntBackground, { left: -114, top: 132-60 });
		this._add(cntBackgroundTop, { left: -114, top: -60 });
		this._add(this.__imgTopRightCorner, { right: 0, top: 0, bottom: 28 });
		this._add(new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_r.png").set({ width: 3, height: 1, allowGrowY: true, scale: true }), { right: 0, top: 35, bottom: 29 });
		this._add(new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_br.png").set({ width: 5, height: 28, allowGrowY: true, scale: true }), { right: 0, bottom: 0 });
		this._add(new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_b.png").set({ width: 1, height: 3, allowGrowX: true, scale: true }), { right: 5, bottom: 0, left: 5 });
		this._add(new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_bl.png").set({ width: 5, height: 29 }), { left: 0, bottom: 0 });
		this._add(new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_l.png").set({ width: 3, height: 1, allowGrowY: true, scale: true }), { left: 0, bottom: 29, top: 32 });
		this._add(this.wdgAnchor, { left: 0, top: 0 });
		this._add(new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_tl2.png").set({ width: 25, height: 5 }), { left: 3, top: 0 });
		this._add(new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_t.png").set({ width: 1, height: 3, allowGrowX: true, scale: true }), { left: 28, right: 34, top: 0 });
		this.__btnClose = new webfrontend.ui.SoundButton(null, "FactionUI/icons/icon_close_button.png").set({ appearance: "button-close", width: 23, height: 23, toolTipText: this.tr("tnf:close base view") });
		this.__btnClose.addListener("execute", this._onClose, this);
		this._add(this.__btnClose, { top: 6, right: 5 });
		
		var app = qx.core.Init.getApplication();
		app.getDesktop().addListener('resize', this._onResize, this);
	},
	
	destruct: function()
	{
		
	},
				
	members: 
	{    
		open: function()
		{                    
			this._onResize();
			var app = qx.core.Init.getApplication();
			app.getDesktop().add(this);
			
			var mail = zmail.structure.getInstance();
			var check = function()
			{
				var div = document.getElementById('zdoom_mail_container');
				if(div) div.appendChild(mail.dom.window.main);
				else setTimeout(check, 1000);
			};
			check();
		},
		
		_onClose: function ()
		{
			var app = qx.core.Init.getApplication();
			app.getDesktop().remove(this);
		},
		
		_onResize: function()
		{
			var app = qx.core.Init.getApplication();
			var mainOverlay = app.getMainOverlay();
			var left = (app.getDesktop().getBounds().width - mainOverlay.getWidth()) / 2;
			this.setUserBounds(left, mainOverlay.getBounds().top, mainOverlay.getWidth(), 546);
			this.widget.setWidth(mainOverlay.getWidth());
		},
		
		center: function()
		{
			var parent = this.getLayoutParent();
			if (parent) var bh = parent.getBounds();
			if (bh) var bi = this.getSizeHint();
			var bg = Math.round((bh.width - bi.width) / 2);
			var top = this.getBounds().top;
			this.moveTo(bg,top);
		}
	}

});


qx.Class.define('zmail.compose',
{
	type: 'singleton',
	extend: qx.ui.container.Composite,
	
	construct: function()
	{
		this.base(arguments);
		var layout = new qx.ui.layout.Canvas();
		this._setLayout(layout);
		
		zmail.data.getInstance();
				
		var widget = new qx.ui.core.Widget();
		widget.setPadding(3);
		widget.setHeight(546);
		var div = new qx.html.Element('div', null, {'id': 'zdoom_newMail_container'});
		widget.getContentElement().add(div);
		this.add(widget, {left: 0, top: 0});
		this.widget = widget;

		this.wdgAnchor = new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_tl1.png").set({ width: 3, height: 32 });
		this.__imgTopRightCorner = new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_tr.png").set({ width: 34, height: 35 });
		this.__backgroundTop = new qx.ui.basic.Image(null);
		var cntBackgroundTop = new qx.ui.container.Composite(new qx.ui.layout.Canvas()).set({ height: 132 , maxHeight: 132 });
		var cntBackgroundTopBackground = new qx.ui.container.Composite().set({ backgroundColor: "#000000" });
		cntBackgroundTop.add(cntBackgroundTopBackground, { left: 0, top: 0, right: 0, bottom: 0 });
		cntBackgroundTop.add(this.__backgroundTop, { left: 0, top: -10 });
		this.__background = new qx.ui.basic.Image(null);
		var cntBackground = new qx.ui.container.Composite(new qx.ui.layout.Canvas());
		cntBackground.add(this.__background, { left: 0, top: -10 });
		this._add(cntBackground, { left: -114, top: 132-60 });
		this._add(cntBackgroundTop, { left: -114, top: -60 });
		this._add(this.__imgTopRightCorner, { right: 0, top: 0, bottom: 28 });
		this._add(new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_r.png").set({ width: 3, height: 1, allowGrowY: true, scale: true }), { right: 0, top: 35, bottom: 29 });
		this._add(new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_br.png").set({ width: 5, height: 28, allowGrowY: true, scale: true }), { right: 0, bottom: 0 });
		this._add(new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_b.png").set({ width: 1, height: 3, allowGrowX: true, scale: true }), { right: 5, bottom: 0, left: 5 });
		this._add(new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_bl.png").set({ width: 5, height: 29 }), { left: 0, bottom: 0 });
		this._add(new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_l.png").set({ width: 3, height: 1, allowGrowY: true, scale: true }), { left: 0, bottom: 29, top: 32 });
		this._add(this.wdgAnchor, { left: 0, top: 0 });
		this._add(new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_tl2.png").set({ width: 25, height: 5 }), { left: 3, top: 0 });
		this._add(new qx.ui.basic.Image("webfrontend/ui/common/frame_basewin/frame_basewindow_t.png").set({ width: 1, height: 3, allowGrowX: true, scale: true }), { left: 28, right: 34, top: 0 });
		this.__btnClose = new webfrontend.ui.SoundButton(null, "FactionUI/icons/icon_close_button.png").set({ appearance: "button-close", width: 23, height: 23, toolTipText: this.tr("tnf:close base view") });
		this.__btnClose.addListener("execute", this._onClose, this);
		this._add(this.__btnClose, { top: 6, right: 5 });
		
		var app = qx.core.Init.getApplication();
		app.getDesktop().addListener('resize', this._onResize, this);
	},
	
	destruct: function()
	{
		
	},
				
	members: 
	{  
		isOpen: false,  
		open: function()
		{                    
			this._onResize();
			var app = qx.core.Init.getApplication();
			app.getDesktop().add(this);
			this.isOpen = true;
			
			var mail = zmail.structure.getInstance();
			var check = function()
			{
				var div = document.getElementById('zdoom_newMail_container');
				if(div) div.appendChild(mail.dom.window.compose);
				else setTimeout(check, 1000);
			};
			check();
		},
		
		_onClose: function()
		{
			var app = qx.core.Init.getApplication();
			app.getDesktop().remove(this);
			this.isOpen = false;
		},
		
		_onResize: function()
		{
			var app = qx.core.Init.getApplication();
			var mainOverlay = app.getMainOverlay();
			var left = (app.getDesktop().getBounds().width - mainOverlay.getWidth()) / 2;
			this.setUserBounds(left, mainOverlay.getBounds().top, mainOverlay.getWidth(), 546);
			this.widget.setWidth(mainOverlay.getWidth());
		},
		
		center: function()
		{
			var parent = this.getLayoutParent();
			if (parent) var bh = parent.getBounds();
			if (bh) var bi = this.getSizeHint();
			var bg = Math.round((bh.width - bi.width) / 2);
			var top = this.getBounds().top;
			this.moveTo(bg,top);
		}
	}
});

qx.Class.define('zmail.structure',
{
	type: 'singleton',
	extend: qx.core.Object,
	
	construct: function()
	{
		var root = this;
		var callUpdate = function()
		{
			root.update.apply(root, arguments);
		};
		this.callUpdate = callUpdate;
		
		Element.prototype.zm_append = function (arr) 
		{
			for (var i = 0; i < arr.length; i++) this.appendChild(arr[i]);
		};
		
		Element.prototype.zm_empty = function()
		{
			while(this.firstChild) this.removeChild(this.firstChild);
		};
		
		Element.prototype.zm_css = function(css)
		{
			var iterator = function(obj)
			{
				for(var x in obj) elm.style[x] = obj[x];
			};
			var elm = this;
			for (var key in css) {
				var prop = css[key];
				switch(key)
				{
					case 'over': elm.onmouseover = function(){iterator(css['over'])}; break;
					case 'out': elm.onmouseout = function(){iterator(css['out'])}; break;
					case 'focus': elm.onfocus = function(){iterator(css['focus'])}; break;
					case 'blur': elm.onblur = function(){iterator(css['blur'])}; break;
					default: elm.style[key] = css[key];
				}
			}
		};
		
		Element.prototype.zm_prop = function (obj)
		{
			for (var key in object) this[key] = obj[key];
		};
		
		if(typeof localStorage.ccta_zmail === 'undefined')
		{
			var sd = {
				'folders': {'draft': {}, 'junk': [], 'trash': [[],[]], 'documents': []}, 
				'contacts': {'blocked': [], 'friends': []}, 
				'archive': {}
			};
			localStorage['ccta_zmail'] = JSON.stringify(sd);
		}
		
		this.css.topBar.cont.backgroundImage = this.gradient('#5C5E62', '#3E4042');
		this.css.searchResults.text.backgroundImage = this.gradient('#5a5a5a', '#4a4a4a');
		var blueGrd = root.gradient('#3d7fa0', '#31678a');
		
		var create = this.create, cssStyles = this.css, text = this.text;
		
		var winCont = create('div', cssStyles.window);
		var topBar = create('div', cssStyles.topBar.main);
		var topBarCont = create('div', cssStyles.topBar.cont);
		var leftBar = create('div', cssStyles.leftBar);
		var logo = create('div', cssStyles.topBar.logo);
		var tbMenu = create('div', cssStyles.topBar.menu);
		var middleBar = create('div', cssStyles.middleBar.cont);
		var rightBar = create('div', cssStyles.rightBar.main);
		var leftBarWrapper = create('div', cssStyles.tableCellWrapper);
		var rightBarWrapper = create('div', cssStyles.tableCellWrapper);
		var middleBarWrapper = create('div', cssStyles.tableCellWrapper);
		var msgMask = create('div', cssStyles.rightBar.msgMask);
		var msgCont = create('div', cssStyles.rightBar.msgCont);
		var msgSbc = create('div', cssStyles.rightBar.scrollBar.cont);
		var msgSb = create('div', cssStyles.rightBar.scrollBar.bar);
		var headersMask = create('div', cssStyles.middleBar.headers.mask);
		var headersSbc = create('div', cssStyles.middleBar.scrollBar.cont);
		var headersFooter = create('div', cssStyles.middleBar.footer.cont);
		var headersCont = create('div', cssStyles.middleBar.headers.scroll);
		var mailIcon = document.createElement('img');
		var mailText = document.createTextNode('Z'+'MAIL');
		var expandCont = create('div', cssStyles.compose.rightBar.expand);
		expandCont.style.backgroundImage = 'url(' + this.res.expandDocument + ')';
		expandCont.data = {'isExpanded': false};
		expandCont.onclick = function()
		{
			var expanded = this.data.isExpanded;
			this.style.backgroundImage = (expanded) ? 'url(' + root.res.expandDocument + ')' : 'url(' + root.res.contractDocument + ')';
			leftBar.style.display = (expanded) ? 'table-cell' : 'none';
			middleBar.style.display = (expanded) ? 'table-cell' : 'none';
			this.data.isExpanded = !expanded;
		};
		mailIcon.src = this.res.mail;
		mailIcon.style.marginRight = '6px';
		logo.zm_append([mailIcon, mailText]);
		topBarCont.zm_append([logo, tbMenu]);
		topBar.appendChild(topBarCont);
		msgMask.appendChild(msgCont);
		msgSbc.appendChild(msgSb);
		rightBarWrapper.zm_append([msgMask, msgSbc]);
		rightBar.appendChild(rightBarWrapper);
		headersMask.appendChild(headersCont);
		middleBarWrapper.zm_append([headersMask, headersSbc, headersFooter]);
		middleBar.appendChild(middleBarWrapper);
		winCont.zm_append([topBar, leftBar, middleBar, rightBar]);
		this.enableScroll(msgSb, msgSbc, msgCont);
		
//middleBar Footer
		var pagesBar = create('div', cssStyles.middleBar.footer.pagesBar);
		var pagesInd = create('div', cssStyles.middleBar.footer.indicator);
		var pagesControlCont = create('div', cssStyles.middleBar.footer.pagesControls.cont);
		var pagesControlLabel = create('div', cssStyles.middleBar.footer.pagesControls.label);
		var selectAllCont = create('div', cssStyles.middleBar.footer.selectAll.span);
		var selectAllCheckBox = create('div', cssStyles.middleBar.footer.selectAll.checkBox);
		
		pagesBar.appendChild(pagesInd);
		selectAllCont.appendChild(selectAllCheckBox);
		headersFooter.zm_append([pagesBar, selectAllCont, pagesControlLabel, pagesControlCont]);
		
		headersFooter.onmouseover = function(){ pagesControlLabel.style.display = 'block' };
		headersFooter.onmouseout = function(){ pagesControlLabel.style.display = 'none' };
		
		var changePage = function(mode)
		{
			var f = root.selectedFolder, l = root.folders[f].msgs.length, t = Math.ceil(l / 30) - 1, p = root.selectedPage, np;
			var populate = function(){ root.populateHeaders.apply(root, arguments) }
			
			switch(mode)
			{
				case 'next': np = (p + 1 > t) ? t : p + 1; break;
				case 'previous': np = (p - 1 < 0) ? 0 : p - 1; break;
				case 'first': np = 0; break;
				case 'last': np = t; break;
			}
			if ( p == np) return;
			root.selectedPage = np;
			populate();
		};
		
		['first', 'previous', 'next', 'last'].map(function(btn)
		{
			var controlBtn = create('div', cssStyles.middleBar.footer.pagesControls.icon);
			if (btn == 'previous') controlBtn.style.marginRight = '5px';
			controlBtn.style.backgroundImage = 'url(' + root.res.controls[btn] + ')';
			controlBtn.onclick = function(){ changePage(btn) };
			pagesControlCont.appendChild(controlBtn);
		});
		
		var selectAll = function(){ root.selectAll.apply(root, arguments) };
		var addGroup = function(){ root.addGroupToSelection.apply(root, arguments) };
		var removeGroup = function(){ root.removeGroupFromSelection.apply(root, arguments) };
		selectAllCheckBox.data = {'isChecked': false};
		selectAllCheckBox.onmousedown = function(){this.style.background = '#202020'};
		selectAllCheckBox.onmouseup = function()
		{
			var isChecked = this.data.isChecked;
			var color = isChecked ? 'transparent' : '#9f9f9f';
			this.style.background = color;
			this.data.isChecked = !isChecked;
			var groups = ['alliance', 'commanders', 'friends', 'blocked'];
			(root.selectedFolder) ? selectAll(!isChecked) : (isChecked) ? removeGroup() : addGroup();
		};
///////////////////////////////////////////////////////////////////////////////////
			
//Search Messages		
		var searchBox = create('textField', cssStyles.input.text.search);
		this.placeHolder(searchBox, 'Search...');
		
		var resultsCont = create('div', cssStyles.searchResults.cont);
		var resultsUl = create('ul', cssStyles.searchResults.ul);
		var bySender = create('li', cssStyles.searchResults.li.main);
		var bySubject = create('li', cssStyles.searchResults.li.main);
		var bySenderCount = create('span', cssStyles.searchResults.count);
		var bySubjectCount = create('span', cssStyles.searchResults.count);
		var bySenderUl = create('ul', cssStyles.searchResults.ul);
		var bySubjectUl = create('ul', cssStyles.searchResults.ul);
		var bySenderTxt = create('p', cssStyles.searchResults.text);
		var bySubjectTxt = create('p', cssStyles.searchResults.text);
		text(bySenderTxt, 'From: ');
		text(bySubjectTxt, 'Subject: ');
		bySenderTxt.appendChild(bySenderCount);
		bySubjectTxt.appendChild(bySubjectCount);
		bySender.zm_append([bySenderTxt, bySenderUl]);
		bySubject.zm_append([bySubjectTxt, bySubjectUl]);
		resultsUl.zm_append([bySender, bySubject]);
		resultsCont.appendChild(resultsUl);
		resultsCont.data = {'isFocused': false};
		
		var searchFolder = function(){ root.searchFolder.apply(root, arguments) };
		resultsCont.onmouseover = function(){this.data.isFocused = true};
		resultsCont.onmouseout = function(){this.data.isFocused = false};
		
		searchBox.onkeyup = function()
		{
			var str = this.value;
			searchFolder(str);
		};
		
		searchBox.onblur = function()
		{
			if (!resultsCont.data.isFocused) resultsCont.style.display = 'none';
			this.value = 'Search...';
			this.style.color = '#333333';
		};
		
///////////////////////////////////////////////////////////////////////////////////

//folders & contacts		
		var lbList = create('ul', cssStyles.ul.leftBar.main);
		var foldersLi = create('li', cssStyles.li.leftBar.main);
		var contactsLi = create('li', cssStyles.li.leftBar.main);
		var foldersUl = create('ul', cssStyles.ul.leftBar.sub);
		var contactsUl = create('ul', cssStyles.ul.leftBar.sub);
		var inboxLi = create('li', cssStyles.li.leftBar.subSelected);
		var outboxLi = create('li', cssStyles.li.leftBar.sub);
		var draftLi = create('li', cssStyles.li.leftBar.sub);
		var junkLi = create('li', cssStyles.li.leftBar.sub);
		var trashLi = create('li', cssStyles.li.leftBar.sub);
		var documentsLi = create('li', cssStyles.li.leftBar.sub);
		var friendsLi = create('li', cssStyles.li.leftBar.sub);
		var blockedLi = create('li', cssStyles.li.leftBar.sub);
		var allianceLi = create('li', cssStyles.li.leftBar.sub);
		var commandersLi = create('li', cssStyles.li.leftBar.sub);
		var inboxTxt = document.createTextNode('Inbox');
		var outboxTxt = document.createTextNode('Outbox');
		var draftTxt = document.createTextNode('Draft');
		var junkTxt = document.createTextNode('Junk');
		var trashTxt = document.createTextNode('Trash');
		var documentsTxt = document.createTextNode('Documents');
		var friendsTxt = document.createTextNode('Friends');
		var blockedTxt = document.createTextNode('Blocked');
		var allianceTxt = document.createTextNode('Alliance');
		var commandersTxt = document.createTextNode('Commanders');
		
		inboxLi.appendChild(inboxTxt);
		outboxLi.appendChild(outboxTxt);
		draftLi.appendChild(draftTxt);
		junkLi.appendChild(junkTxt);
		trashLi.appendChild(trashTxt);
		documentsLi.appendChild(documentsTxt);
		friendsLi.appendChild(friendsTxt);
		blockedLi.appendChild(blockedTxt);
		allianceLi.appendChild(allianceTxt);
		commandersLi.appendChild(commandersTxt);
		
		var changeFolder = function(folder)
		{
			if (root.selectedGroup) root.dom.leftBar.items[root.selectedGroup].zm_css(cssStyles.li.leftBar.sub);
			if (root.selectedFolder) root.dom.leftBar.items[root.selectedFolder].zm_css(cssStyles.li.leftBar.sub);
			root.dom.leftBar.items[folder].zm_css(cssStyles.li.leftBar.subSelected);
			root.selectedFolder = folder;
			root.selectedGroup = false;
			root.resetMsgCont();
			root.selectedPage = 0;
			root.populateHeaders();
			searchBox.disabled = false;
			msgSb.data.update();
		};
		
		var changeGroup = function(group)
		{
			if (root.selectedGroup) root.dom.leftBar.items[root.selectedGroup].zm_css(cssStyles.li.leftBar.sub);
			if (root.selectedFolder) root.dom.leftBar.items[root.selectedFolder].zm_css(cssStyles.li.leftBar.sub);
			root.dom.leftBar.items[group].zm_css(cssStyles.li.leftBar.subSelected);
			root.selectedGroup = group;
			root.selectedFolder = false;
			root.populateContacts('rank');
			searchBox.disabled = true;
			msgSb.data.update();
		};
		
		[[inboxLi,'inbox'],[outboxLi,'outbox'],[draftLi,'draft'],[junkLi,'junk'],[trashLi,'trash'],[documentsLi,'documents']].map(function(Item)
		{
			Item[0].onclick = function(){ changeFolder(Item[1]) }
		});
		
		[[friendsLi,'friends'],[blockedLi,'blocked'],[allianceLi,'alliance'],[commandersLi,'commanders']].map(function(Item)
		{
			Item[0].onclick = function(){ changeGroup(Item[1]) }
		});
		
		foldersUl.zm_append([inboxLi, outboxLi, draftLi, junkLi, trashLi, documentsLi]);
		contactsUl.zm_append([allianceLi, commandersLi, friendsLi, blockedLi]);
		foldersLi.zm_append([document.createTextNode('Folders'), foldersUl]);
		contactsLi.zm_append([document.createTextNode('Contacts'), contactsUl]);
		lbList.zm_append([foldersLi, contactsLi]);
		leftBarWrapper.zm_append([searchBox, lbList, resultsCont]);
		leftBar.appendChild(leftBarWrapper);
		
		this.dom.leftBar.folders.inbox = inboxTxt;
		this.dom.leftBar.folders.outbox = outboxTxt;
		this.dom.leftBar.folders.junk = junkTxt;
		this.dom.leftBar.folders.trash = trashTxt;
		this.dom.leftBar.folders.draft = draftTxt;
		this.dom.leftBar.folders.documents = documentsTxt;
		this.dom.leftBar.contacts.friends = friendsTxt;
		this.dom.leftBar.contacts.blocked = blockedTxt;
		this.dom.leftBar.contacts.alliance = allianceTxt;
		this.dom.leftBar.contacts.commanders = commandersTxt;
		this.dom.leftBar.items.inbox = inboxLi;
		this.dom.leftBar.items.outbox = outboxLi;
		this.dom.leftBar.items.junk = junkLi;
		this.dom.leftBar.items.trash = trashLi;
		this.dom.leftBar.items.draft = draftLi;
		this.dom.leftBar.items.documents = documentsLi;
		this.dom.leftBar.items.friends = friendsLi;
		this.dom.leftBar.items.blocked = blockedLi;
		this.dom.leftBar.items.alliance = allianceLi;
		this.dom.leftBar.items.commanders = commandersLi;
///////////////////////////////////////////////////////////////////////////////////

//selected contacts container
		var sc_mainCont = document.createElement('div');
		var sc_upperCont = create('div', cssStyles.rightBar.contacts.topWrapper);
		var sc_lowerCont = create('div', cssStyles.rightBar.contacts.bottomWrapper);
		var sc_header = create('div', cssStyles.message.subject);
		var sc_contactsCont = create('div', cssStyles.rightBar.contacts.cont);
		var sc_findPlayer = create('textField', cssStyles.rightBar.contacts.search);
		var sc_removeAll = create('div', cssStyles.rightBar.contacts.button.disabled);
		var sc_message = create('div', cssStyles.rightBar.contacts.button.disabled);
		var sc_addToSelection = create('div', cssStyles.rightBar.contacts.button.active);
		var sc_addAsFriend = create('div', cssStyles.rightBar.contacts.button.active);
		var sc_block = create('div', cssStyles.rightBar.contacts.button.active);
		var sc_resultsCont = create('div', cssStyles.rightBar.contacts.results.cont);
		var sc_resultsMask = create('div', cssStyles.rightBar.contacts.results.mask);
		var sc_resultsContentCont = create('div', cssStyles.rightBar.contacts.results.contentsCont);
		var sc_resultsSbc = create('div', cssStyles.rightBar.contacts.results.scrollbar.cont);
		text(sc_header, 'No contacts selected.');
		text(sc_removeAll, 'Remove all');
		text(sc_message, 'Message');
		text(sc_addToSelection, 'Add to selection');
		text(sc_addAsFriend, 'Add as friend');
		text(sc_block, 'Block');
		this.placeHolder(sc_findPlayer, 'Find player...');
		sc_mainCont.style.overflow = 'hidden';
		sc_removeAll.zm_css({'display': 'inline-block', 'verticalAlign': 'top', 'width': '101px'});
		sc_message.zm_css({'display': 'inline-block', 'verticalAlign': 'top', 'marginLeft': '5px', 'width': '80px'});
		[sc_addToSelection, sc_addAsFriend, sc_block].map(function(x){ x.zm_css({'width': '120px', 'margin': '0 auto 5px auto'}) });
		sc_resultsMask.appendChild(sc_resultsContentCont);
		sc_resultsCont.zm_append([sc_resultsMask, sc_resultsSbc]);
		sc_upperCont.zm_append([sc_contactsCont, sc_findPlayer, sc_removeAll, sc_message]);
		sc_lowerCont.zm_append([sc_addToSelection, sc_addAsFriend, sc_block]);
		sc_mainCont.zm_append([sc_header, sc_upperCont, sc_lowerCont, sc_resultsCont]);
		this.dom.rightBar.contacts.main = sc_mainCont;
		this.dom.rightBar.contacts.lowerCont = sc_lowerCont;
		this.dom.rightBar.contacts.header = sc_header;
		this.dom.rightBar.contacts.cont = sc_contactsCont;
		this.dom.rightBar.contacts.search = sc_findPlayer;
		this.dom.rightBar.contacts.results = sc_resultsCont;
		this.dom.rightBar.contacts.scrollbarCont = sc_resultsSbc;
		this.dom.rightBar.contacts.contentsCont = sc_resultsContentCont;
		this.dom.rightBar.contacts.buttons.removeAll = sc_removeAll;
		this.dom.rightBar.contacts.buttons.message = sc_message;
		this.dom.rightBar.contacts.buttons.addToSelection = sc_addToSelection;
		this.dom.rightBar.contacts.buttons.addAsFriend = sc_addAsFriend;
		this.dom.rightBar.contacts.buttons.block = sc_block;
		
		var addFriend = function(){ root.addFriend.apply(root, arguments) };
		var removeFriend = function(){ root.removeFriend.apply(root, arguments) };
		var blockContact = function(){ root.blockContact.apply(root, arguments) };
		var unblockContact = function(){ root.unblockContact.apply(root, arguments) };
		var removeAllSelectedContacts = function(){ root.removeAllSelectedContacts.apply(root, arguments) };
		var addContact = function(){ root.addToSelection.apply(root, arguments) };
		var removeContact = function(){ root.removeFromSelection.apply(root, arguments) };
		var setContactOptions = function(){ root.setContactOptions.apply(root, arguments) };
		var newMail = function(){ root.openNewMail.apply(root, arguments) };
		
		sc_addToSelection.data = {'add': addContact, 'remove': removeContact, 'id': null, 'mode': null, 'update': setContactOptions};
		sc_addAsFriend.data = {'add': addFriend, 'remove': removeFriend, 'id': null, 'mode': null, 'update': setContactOptions};
		sc_block.data = {'block': blockContact, 'unblock': unblockContact, 'id': null, 'mode': null, 'update': setContactOptions};
		sc_removeAll.data = {};
		sc_message.data = {};
		
		sc_addToSelection.onclick = function()
		{
			((this.data.isEnabled) && (this.data.mode == 'add')) ? this.data.add(this.data.id) : this.data.remove(this.data.id);
			this.data.update(this.data.id);
		};
		sc_addAsFriend.onclick = function()
		{
			((this.data.isEnabled) && (this.data.mode == 'add')) ? this.data.add(this.data.id) : this.data.remove(this.data.id);
			this.data.update(this.data.id);
		};
		sc_block.onclick = function()
		{
			((this.data.isEnabled) && (this.data.mode == 'block')) ? this.data.block(this.data.id) : this.data.unblock(this.data.id);
			this.data.update(this.data.id);
		};
		sc_removeAll.onclick = function(){removeAllSelectedContacts()};
		
		sc_message.onclick = function(){ if(this.data.isEnabled) newMail(1) };
		
		[sc_addToSelection, sc_addAsFriend, sc_block, sc_removeAll, sc_message].map(function(btn)
		{
			var enable = function()
			{
				this.zm_css(cssStyles.rightBar.contacts.button.active);
				this.data.isEnabled = true;
			};
			var disable = function()
			{
				this.zm_css(cssStyles.rightBar.contacts.button.disabled);
				this.data.isEnabled = false;
			}
			btn.data.enable = function(){ enable.call(btn) };
			btn.data.disable = function(){ disable.call(btn) };
			btn.data.isEnabled = true;
		});
		sc_resultsCont.onmouseover = function(){sc_findPlayer.data.isContFocused = true};
		sc_resultsCont.onmouseout = function(){sc_findPlayer.data.isContFocused = false};
		sc_lowerCont.onmouseover = function(){sc_findPlayer.data.isContFocused = true};
		sc_lowerCont.onmouseout = function(){sc_findPlayer.data.isContFocused = false};
		sc_findPlayer.data = {'results': [], 'selectedIndex': 0, 'selectedGroup': 'results', 'selectedButton': 0, 'isContOpen': false, 'isContFocused': false, 'buttons': [sc_addToSelection, sc_addAsFriend, sc_block]};
		sc_findPlayer.onblur = function()
		{
			if (this.data.isContOpen && !this.data.isContFocused)
			{
				this.value = 'Find player...';
				this.data.selectedGroup = 'results';
				this.data.buttons[this.data.selectedButton].zm_css({'background': '#4e4e4e', 'color': '#8b8b8b'});
				this.data.selectedButton = 0;
				this.data.selectedIndex = 0;
				sc_resultsCont.style.display = 'none';
				sc_lowerCont.style.display = 'none';
			}
		};
		sc_findPlayer.onkeyup = function(event)
		{
			if(!event) event = window.event;
			event.preventDefault();
			event.stopPropagation();
			var populate = function(){ root.findContact.apply(root, arguments) };
			var changeSelection = function(){ root.changeContactSelection.apply(root, arguments) };
			var updateOptions = function(){ root.setContactOptions.apply(root, arguments) };
			var group = this.data.selectedGroup; i = this.data.selectedButton, btns = this.data.buttons, l = btns.length, parent = this;
			var changeButton = function(mode)
			{
				var getIndex = function(mode, x)
				{
					return (mode) ? ((i + x) % l) : ((i - x < 0) ? l - x : i - x);
				};
				var n = (btns[getIndex(mode, 1)].data.isEnabled) ? getIndex(mode, 1) : getIndex(mode, 2);
				if(btns[i].data.isEnabled) btns[i].zm_css({'background': '#4e4e4e', 'color': '#8b8b8b'});
				if(btns[n].data.isEnabled) btns[n].zm_css({'background': '#266589', 'color': '#c2c2c2'});
				parent.data.selectedButton = n;
			}
			if([37, 38, 39, 40, 13, 9].indexOf(event.keyCode) == -1)
			{
				populate(this.value);
			}
			if(event.keyCode == 38 && this.data.isContOpen)
			{
				group == 'results' ? changeSelection(false) : changeButton(false);
			}
			if(event.keyCode == 40 && this.data.isContOpen)
			{
				group == 'results' ? changeSelection(true) : changeButton(true);
			}
			if(event.keyCode == 37 && this.data.isContOpen && group == 'buttons')
			{
				this.data.selectedGroup = 'results';
				var selectedButton = this.data.buttons[this.data.selectedButton];
				if(selectedButton.data.isEnabled) selectedButton.zm_css({'background': '#4e4e4e', 'color': '#8b8b8b'});
				this.data.selectedButton = 0;
			}
			if(event.keyCode == 39 && this.data.isContOpen && group == 'results')
			{
				this.data.selectedGroup = 'buttons';
				this.data.buttons[0].zm_css({'background': '#266589', 'color': '#c2c2c2'});
			}
			if(event.keyCode == 13 && this.data.isContOpen)
			{
				if(group == 'buttons')
				{
					this.data.buttons[this.data.selectedButton].onclick();
					updateOptions(this.data.results[this.data.selectedIndex].data.id);
					var button = this.data.buttons[this.data.selectedButton];
					if (button.data.isEnabled) button.zm_css({'background': '#266589', 'color': '#c2c2c2'});
					else
					{
						this.data.buttons[0].zm_css({'background': '#266589', 'color': '#c2c2c2'});
						this.data.selectedButton = 0;
					}
				}
			}
		};
		
///////////////////////////////////////////////////////////////////////////////////

//tools bar		
		var toolsConstructor = function()
		{
			var inboxMsg = create('ul', cssStyles.ul.toolbar.main);
			var newMsg = create('li', cssStyles.li.toolbar.withIcon);
			var reply = create('li', cssStyles.li.toolbar.withDrop);
			var mark = create('li', cssStyles.li.toolbar.withDrop);
			var trash = create('li', cssStyles.li.toolbar.textOnly);
			var restore = create('li', cssStyles.li.toolbar.textOnly);
			var empty = create('li', cssStyles.li.toolbar.textOnly);
			var del = create('li', cssStyles.li.toolbar.textOnly);
			var newMsgIcon = create('span', cssStyles.li.toolbar.newIcon);
			var junk = create('li', cssStyles.li.toolbar.textOnly);
			var notJunk = create('li', cssStyles.li.toolbar.textOnly);
			var markDrop = create('span', cssStyles.li.toolbar.drop);
			var replyDrop = create('span', cssStyles.li.toolbar.drop);
			var replyDropMenu = create('ul', cssStyles.ul.toolbar.sub);
			var markDropMenu = create('ul', cssStyles.ul.toolbar.sub);
			var replyTo = create('li', cssStyles.li.toolbar.sub);
			var replyToAll = create('li', cssStyles.li.toolbar.sub);
			var forwardTo = create('li', cssStyles.li.toolbar.sub);
			var read = create('li', cssStyles.li.toolbar.sub);
			var unread = create('li', cssStyles.li.toolbar.sub);
			var editDraft = create('li', cssStyles.li.toolbar.textOnly);
			var deleteDraft = create('li', cssStyles.li.toolbar.textOnly);
			var toDocuments = create('li', cssStyles.li.toolbar.textOnly);
			[newMsg, reply, mark, del, junk, trash, notJunk, restore, empty, editDraft, deleteDraft, toDocuments].map(function(key)
			{
				key.onmouseover = function(){this.style.backgroundImage = blueGrd};
				key.onmouseout = function(){this.style.backgroundImage = 'none'};
			});
			text(newMsg, 'New');
			text(reply, 'Reply');
			text(del, 'Delete');
			text(mark, 'Mark');
			text(junk, 'Junk');
			text(notJunk, 'Not Junk');
			text(trash, 'Trash');
			text(empty, 'Empty');
			text(restore, 'Restore');
			text(replyTo, 'Reply');
			text(replyToAll, 'Reply all');
			text(forwardTo, 'Forward');
			text(read, 'Read');
			text(unread, 'Unread');
			text(editDraft, 'Edit');
			text(deleteDraft, 'Delete');
			text(toDocuments, 'Document');
			markDrop.style.backgroundImage = 'url(' + root.res.drop + ')';
			replyDrop.style.backgroundImage = 'url(' + root.res.drop + ')';
			newMsgIcon.style.backgroundImage = 'url(' + root.res.compose + ')';
			forwardTo.style.borderBottom = 'none';
			unread.style.borderBottom = 'none';
			replyDropMenu.zm_append([replyTo, replyToAll, forwardTo]);
			markDropMenu.zm_append([read, unread]);
			newMsg.appendChild(newMsgIcon);
			mark.zm_append([markDrop, markDropMenu]);
			reply.zm_append([replyDrop, replyDropMenu]);
			inboxMsg.zm_append([newMsg, reply, mark, del, junk, trash, notJunk, restore, empty, editDraft, deleteDraft, toDocuments]);
			
			newMsg.onclick = root.callMethod('openNewMail');
			replyTo.onclick = root.callMethod('reply');
			replyToAll.onclick = root.callMethod('replyToAll');
			forwardTo.onclick = root.callMethod('forwardMsg');
			junk.onclick = root.callMethod('toJunk');
			notJunk.onclick = root.callMethod('notJunk');
			trash.onclick = root.callMethod('toTrash');
			restore.onclick = root.callMethod('notTrash');
			del.onclick = root.callMethod('deleteMsg');
			empty.onclick = root.callMethod('emptyFolder');
			read.onclick = root.callMethod('markRead', true);
			unread.onclick = root.callMethod('markRead', false);
			editDraft.onclick = root.callMethod('editDraft');
			deleteDraft.onclick = root.callMethod('deleteDraft');
			toDocuments.onclick = root.callMethod('toDocuments');
			
			var attachSub = function(btn, menu)
			{
				btn.data = {'isActive': false};
				menu.data = {'isFocused': false};
				btn.addEventListener('mouseover', function()
				{
					var isActive = this.data.isActive;
					menu.style.display = (isActive) ? 'none' : 'block';
					this.data.isActive = !isActive;
				}, false);
				menu.addEventListener('mouseover', function(){this.data.isFocused = true;}, false);
				menu.addEventListener('mouseout', function()
				{
					this.data.isFocused = false;
					setTimeout(function(){if(!menu.data.isFocused){menu.style.display = 'none'; btn.data.isActive = false;}}, 100);
				}, false);
				btn.addEventListener('mouseout', function()
				{
					setTimeout(function(){if(!menu.data.isFocused){menu.style.display = 'none'; btn.data.isActive = false;}}, 100);
				}, false);
			}
			attachSub(replyDrop, replyDropMenu);
			attachSub(markDrop, markDropMenu);
			root.dom.toolBar.compose = newMsg;
			root.dom.topBar.toolbar.newMsg = newMsg;
			root.dom.topBar.toolbar.reply = reply;
			root.dom.topBar.toolbar.trash = trash;
			root.dom.topBar.toolbar.delMsg = del;
			root.dom.topBar.toolbar.junk = junk;
			root.dom.topBar.toolbar.notJunk = notJunk;
			root.dom.topBar.toolbar.restore = restore;
			root.dom.topBar.toolbar.empty = empty;
			root.dom.topBar.toolbar.mark = mark;
			root.dom.topBar.toolbar.editDraft = editDraft;
			root.dom.topBar.toolbar.deleteDraft = deleteDraft;
			root.dom.topBar.toolbar.toDocuments = toDocuments;
			this.inboxMsg = inboxMsg;
		};
		
		var toolbars = new toolsConstructor();
		tbMenu.appendChild(toolbars.inboxMsg);
///////////////////////////////////////////////////////////////////////////////////

//create main dom tree		
		this.dom.window.main = winCont;
		this.dom.rightBar.cont = rightBar;
		this.dom.rightBar.msgCont = msgCont;
		this.dom.rightBar.scrollBar.cont = msgSbc;
		this.dom.rightBar.scrollBar.bar = msgSb;
		this.dom.rightBar.expandCont = expandCont;
		this.dom.searchResults.cont = resultsCont;
		this.dom.searchResults.sender.count = bySenderCount;
		this.dom.searchResults.subject.count = bySubjectCount;
		this.dom.searchResults.sender.list = bySenderUl;
		this.dom.searchResults.subject.list = bySubjectUl;
		this.dom.middleBar.headersCont = headersCont;
		this.dom.middleBar.scrollBar.cont = headersSbc;
		this.dom.middleBar.footer.selectAll = selectAllCheckBox;
		this.dom.middleBar.footer.pagesCount = pagesControlLabel;
		this.dom.middleBar.footer.indicator = pagesInd;
		this.dom.middleBar.footer.controlCont = pagesControlCont;
		this.dom.topBar.logo = logo;
		this.dom.topBar.menu = toolbars.inboxMsg;
///////////////////////////////////////////////////////////////////////////////////

//compose message container		
		var composeCont = create('div', cssStyles.compose.window);
		var c_topBar = create('div', cssStyles.topBar.main);
		var c_topBarCont = create('div', cssStyles.topBar.cont);
		var c_leftBar = create('div', cssStyles.compose.leftBar.cont);
		var c_rightBar = create('div', cssStyles.compose.rightBar.cont);
		var c_leftBarWrapper = create('div', cssStyles.tableCellWrapper);
		var c_rightBarWrapper = create('div', cssStyles.tableCellWrapper);
		var c_logo = logo.cloneNode(true);
		var c_tbMenu = create('div', cssStyles.topBar.menu);
		var c_recipients = create('div', cssStyles.compose.leftBar.recipients.main);
		var c_recipientsMask = create('div', cssStyles.compose.leftBar.recipients.mask);
		var c_recipientsCont = create('div', cssStyles.compose.leftBar.recipients.cont);
		var c_recipientsSbc = create('div', cssStyles.compose.leftBar.recipients.scrollbar.cont);
		var c_recipientsSb = create('div', cssStyles.compose.leftBar.recipients.scrollbar.bar);
		var c_searchResults = create('div', cssStyles.compose.leftBar.recipients.searchBox.cont);
		var c_contacts = create('div', cssStyles.compose.leftBar.contacts.cont);
		var c_subject = create('textField', cssStyles.compose.rightBar.textField);
		var c_msgToolbar = create('div', cssStyles.compose.rightBar.toolbar.cont);
		var c_msgBody = create('iframe', cssStyles.compose.rightBar.textArea);
		var c_expandCont = create('div', cssStyles.compose.rightBar.expand);
		
		//table options
		var c_tableOptions = create('div', cssStyles.tableCellWrapper);
		var c_rowsCont = create('div', cssStyles.compose.leftBar.tableOptions.inputCont);
		var c_rowsInput = create('textField', cssStyles.compose.leftBar.tableOptions.input);
		var c_rowsLabel = create('div', cssStyles.compose.leftBar.tableOptions.label);
		var c_colsInput = create('textField', cssStyles.compose.leftBar.tableOptions.input);
		var c_colsCont = create('div', cssStyles.compose.leftBar.tableOptions.inputCont);
		var c_colsLabel = create('div', cssStyles.compose.leftBar.tableOptions.label);
		var c_headerCheckbox = create('div', cssStyles.compose.leftBar.tableOptions.checkbox);
		var c_headerLabel = create('span', cssStyles.compose.leftBar.tableOptions.span);
		var c_expandCheckbox = create('div', cssStyles.compose.leftBar.tableOptions.checkbox);
		var c_expandLabel = create('span', cssStyles.compose.leftBar.tableOptions.span);
		var c_addTable = create('div', cssStyles.compose.leftBar.tableOptions.button);
		var c_cancelTable = create('div', cssStyles.compose.leftBar.tableOptions.button);
		text(c_rowsLabel, 'Rows');
		text(c_colsLabel, 'Columns');
		text(c_headerLabel, 'Header');
		text(c_expandLabel, 'Expand horizontally');
		text(c_addTable, 'Add table');
		text(c_cancelTable, 'Cancel');
		c_tableOptions.data = {'isOpen': false};
		c_headerCheckbox.data = {'isChecked': false};
		c_expandCheckbox.data = {'isChecked': false};
		c_tableOptions.style.paddingTop = '10px';
		[c_expandCheckbox, c_headerCheckbox].map(function(checkBox)
		{
			checkBox.onmousedown = function(){this.style.background = '#202020'};
			checkBox.onmouseup = function()
			{
				var isChecked = this.data.isChecked;
				this.style.background = (isChecked) ? 'transparent' : '#9f9f9f';
				this.data.isChecked = !isChecked;
			};
		});
		c_rowsCont.zm_append([c_rowsInput, c_rowsLabel]);
		c_colsCont.zm_append([c_colsInput, c_colsLabel]);
		c_headerCheckbox.appendChild(c_headerLabel);
		c_expandCheckbox.appendChild(c_expandLabel);
		c_tableOptions.zm_append([c_rowsCont, c_colsCont, c_headerCheckbox, c_expandCheckbox, c_addTable, c_cancelTable]);
		////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
		
		var c_search = create('textField', cssStyles.compose.leftBar.recipients.textField);
		var c_searchCont = create('p', cssStyles.compose.leftBar.recipients.textFieldCont);
		var c_toolBar =  create('ul', cssStyles.ul.toolbar.main);
		var c_sendMsg = create('li', cssStyles.li.toolbar.withIcon);
		var c_sendMsgIcon = create('span', cssStyles.li.toolbar.newIcon);
		var c_cancelMsg = create('li', cssStyles.li.toolbar.textOnly);
		var c_saveDraft = create('li', cssStyles.li.toolbar.textOnly);
		text(c_sendMsg, 'Send');
		text(c_cancelMsg, 'Cancel');
		text(c_saveDraft, 'Save draft');
		c_sendMsgIcon.style.backgroundImage = 'url(' + root.res.sendMail + ')';
		c_sendMsg.appendChild(c_sendMsgIcon);
		c_toolBar.zm_append([c_sendMsg, c_cancelMsg, c_saveDraft]);
		c_tbMenu.appendChild(c_toolBar);
		c_topBarCont.zm_append([c_logo, c_tbMenu]);
		c_topBar.appendChild(c_topBarCont);
		c_searchCont.appendChild(c_search);
		c_recipientsMask.appendChild(c_recipientsCont);
		c_recipients.zm_append([c_recipientsMask, c_recipientsSbc]);
		c_recipientsSbc.appendChild(c_recipientsSb);
		this.enableScroll(c_recipientsSb, c_recipientsSbc, c_recipientsCont);
		c_msgBody.scrolling = 'no';
		c_expandCont.style.backgroundImage = 'url(' + this.res.expandDocument + ')';
		c_expandCont.data = {'isExpanded': false};
		c_search.data = {'results': [], 'selectedIndex': 0, 'isContOpen': false, 'isContFocused': false};
		[c_sendMsg, c_cancelMsg, c_saveDraft].map(function(key)
		{
			key.onmouseover = function(){this.style.backgroundImage = blueGrd};
			key.onmouseout = function(){this.style.backgroundImage = 'none'};
		});
		var countMsgLength = function(){ root.getCharactersCount.apply(root, arguments) };
		c_sendMsg.onclick = function()
		{
			root.sendMail.call(root);
			zmail.compose.getInstance()._onClose();
		};
		c_saveDraft.onclick = function()
		{
			root.saveDraft.call(root);
			zmail.compose.getInstance()._onClose();
		};
		c_cancelMsg.onclick = function()
		{
			zmail.compose.getInstance()._onClose();
		};
		c_expandCont.onclick = function()
		{
			var expanded = this.data.isExpanded;
			this.style.backgroundImage = (expanded) ? 'url(' + root.res.expandDocument + ')' : 'url(' + root.res.contractDocument + ')';
			c_leftBar.style.display = (expanded) ? 'table-cell' : 'none';
			this.data.isExpanded = !expanded;
		};
		
		var c_searchResultsMask = create('div', cssStyles.compose.leftBar.recipients.searchBox.mask);
		var c_searchResultsSbc = create('div', cssStyles.compose.leftBar.recipients.searchBox.scrollbar.cont);
		var c_searchResultsCont = create('div', cssStyles.compose.leftBar.recipients.searchBox.itemsCont);
		var c_msgHeader = create('div', cssStyles.compose.rightBar.msgHeader);
		var c_msgMask = create('div', cssStyles.compose.rightBar.msgMask);
		var c_msgCont = create('div', cssStyles.compose.rightBar.msgCont);
		var c_msgSbc = create('div', cssStyles.compose.rightBar.scrollBar.cont);
		var c_msgSb = create('div', cssStyles.compose.rightBar.scrollBar.bar);
		var c_toText = create('div', cssStyles.compose.leftBar.recipients.toText);
		var c_charCount = create('div', {'position': 'absolute', 'bottom': 0, 'right': '16px', 'padding': '10px', 'color': '#999', 'fontSize': '12px'});
		text(c_toText, 'To:');
		this.placeHolder(c_subject, 'Add Subject:');
		c_recipientsCont.appendChild(c_searchCont);
		c_searchResultsMask.appendChild(c_searchResultsCont);
		c_searchResults.zm_append([c_searchResultsMask, c_searchResultsSbc]);
		c_leftBarWrapper.zm_append([c_toText, c_recipients, c_searchResults, c_contacts]);
		c_leftBar.appendChild(c_leftBarWrapper);
		c_msgCont.appendChild(c_msgBody);
		c_msgHeader.zm_append([c_subject, c_msgToolbar, c_expandCont]);
		c_msgMask.zm_append([c_msgCont, c_msgHeader, c_charCount]);
		c_rightBarWrapper.zm_append([c_msgMask, c_msgSbc]);
		c_rightBar.appendChild(c_rightBarWrapper);
		composeCont.zm_append([c_topBar, c_leftBar, c_rightBar]);
		c_searchResultsCont.onmouseover = function(){c_search.data.isContFocused = true};
		c_searchResultsCont.onmouseout = function(){c_search.data.isContFocused = false};
		c_msgSbc.appendChild(c_msgSb);
		root.enableScroll(c_msgSb, c_msgSbc, c_msgCont);
		c_msgSb.style.display = 'none';
		
		this.dom.compose.leftBar.results.mainCont = c_searchResults;
		this.dom.compose.leftBar.results.resultsCont = c_searchResultsCont;
		this.dom.compose.leftBar.results.scrollbarCont = c_searchResultsSbc;
		this.dom.compose.leftBar.searchBox = c_search;
		this.dom.compose.leftBar.searchBoxCont = c_searchCont;
		this.dom.compose.leftBar.recipientsMainCont = c_recipients;
		this.dom.compose.leftBar.recipientsCont = c_recipientsCont;
		this.dom.compose.leftBar.recipientsSbc = c_recipientsSbc;
		this.dom.compose.leftBar.recipientsSb = c_recipientsSb;
		this.dom.compose.rightBar.iframe = c_msgBody;
		this.dom.compose.rightBar.msgCont = c_msgCont;
		this.dom.compose.rightBar.subject = c_subject;
		this.dom.compose.rightBar.charCount = c_charCount;
		
		//find contact
		c_search.onblur = function()
		{
			if (this.data.isContOpen && !this.data.isContFocused)
			{
				var rest = function() { root.clearPlayersSearch.apply(root, arguments); };
				var add = function() { root.addRecipient.apply(root, arguments); };
				if( root.completePlayerMatch ) add(this.value);
				this.value = '';
				rest(0);
			}
		};
		c_search.onkeyup = function(event)
		{
			if(!event) event = window.event;
			event.preventDefault();
			var add = function(){ root.addRecipient.apply(root, arguments); };
			if([38, 40, 13, 9].indexOf(event.keyCode) == -1)
			{
				var populate = function(){ root.findPlayer.apply(root, arguments); };
				populate(this.value);
			}
			if(event.keyCode == 40 && this.data.isContOpen)
			{
				var next = function(){ root.changePlayerSelection.apply(root, arguments); };
				next(true);
			}
			if(event.keyCode == 38 && this.data.isContOpen)
			{
				var previous = function(){ root.changePlayerSelection.apply(root, arguments); };
				previous(false);
			}
			if(event.keyCode == 13 && this.data.isContOpen)  add(this.data.results[this.data.selectedIndex].data.name);
		};
		//////////////////////////////////////////////////////////////////////////////
		
		//IFRAME onload + compose message toolbar
		c_msgBody.onload = function()
		{
			c_msgToolbar.zm_empty();
			var iframe = c_msgBody.contentWindow.document;
			var ibody = iframe.body;
			var updateMessage = function(doc)
			{
				var msg = this.encodeMsg(doc);
				var count = this.getCharactersCount(msg);
				c_charCount.innerHTML = 3000 - parseInt(count, 10);
			};
			var updateScroll = function()
			{
				var h = c_msgBody.contentWindow.document.body.offsetHeight;
				c_msgBody.style.height = Math.max(100, h + 10) + 'px';
				c_msgSb.style.display = (c_msgCont.offsetHeight > c_msgMask.offsetHeight) ? 'block' : 'none';
				c_msgSb.data.update();
			};
			var style = iframe.createElement("style");
			var addCSSRule = function(sheet, selector, rules, index)
			{
				(sheet.insertRule) ? sheet.insertRule(selector + "{" + rules + "}", index) : sheet.addRule(selector, rules, index);
			};
			style.appendChild(iframe.createTextNode(""));
			iframe.getElementsByTagName('head')[0].appendChild(style);
			var sheet = style.sheet;
			addCSSRule(sheet, "body", "display:inline-block; color:#999; font-family:vrinda; font-size:14px; width:100%; margin:0; padding:0; word-break:break-all;", 0);
			addCSSRule(sheet, "ul", "margin:0; color:#999;", 1);
			addCSSRule(sheet, "ol", "margin:0; color:#999;", 2);
			addCSSRule(sheet, "li", "font-family:vrinda; color:#999;", 3);
			addCSSRule(sheet, "a", "font-family: vrinda", 4);
			addCSSRule(sheet, "div", "font-family:vrinda; color:#999;", 5);
			addCSSRule(sheet, "blockquote", "font-family:vrinda; color:#999;", 6);
			addCSSRule(sheet, "table", "border-color: #999; color: #999; font-family: vrinda; font-size: 14px;", 7);
			addCSSRule(sheet, "th", "background-color: #999; color: #333; padding: 3px 15px; font-weight: normal; color: #292929; font-family: vrinda; font-size: 14px;", 8);
			addCSSRule(sheet, "td", "padding: 4px 15px; color: #999; font-family: vrinda; font-size: 14px; word-break: break-all;", 9);

			iframe.designMode = 'on';
			ibody.innerHTML = (root.iframeContent) ? root.iframeContent : 'Add Text';
			c_charCount.innerHTML = 3000 - root.getCharactersCount();
			c_msgBody.contentWindow.onfocus = function()
			{
				if (ibody.innerHTML == 'Add Text') ibody.innerHTML = ''
				if (c_tableOptions.data.isOpen)
				{
					c_leftBar.removeChild(c_tableOptions);
					c_leftBarWrapper.style.display = 'block';
					c_tableOptions.data.isOpen = false;
				}
			};
			c_msgBody.contentWindow.onblur = function(){if(ibody.innerHTML == '' || ibody.innerHTML == '<br>') ibody.innerHTML = 'Add Text'};
			c_msgBody.contentWindow.onkeyup = function()
			{
				var clone = this.document.body.cloneNode(true);
				root.iframeContent = this.document.body.innerHTML;
				updateMessage.call(root, clone);
				updateScroll();
			};
			
			var getSelectedText = function()
			{
				var sel, range, selectedText;
				if (c_msgBody.contentWindow.getSelection)
				{
					sel = c_msgBody.contentWindow.getSelection();
					if (sel.rangeCount) selectedText = sel.getRangeAt(0).toString();
				}
				else if (iframe.selection && iframe.selection.createRange) selectedText = iframe.selection.createRange().text + "";
				return selectedText;
			};
			
			var createLink = function(type)
			{
				var generateLink = function(txt)
				{
					var data = zmail.data.getInstance(), bb = data.createBBCode, a;
					switch(type)
					{
						case 'coords': a = (txt.match(/^\d+:\d+$/)) ? bb.coords(txt, txt.split(':')[0], txt.split(':')[1]) : false; break;
						case 'player': a = bb.player(txt); break;
						case 'alliance': a = bb.alliance(txt); break;
					}
					return a;
				};
				var selectedText = getSelectedText();
				var Link = generateLink(selectedText).replace('webfrontend', 'parent.webfrontend');
				if(Link) return Link;
			};
			
			var resetTableOptions = function()
			{
				c_rowsInput.value = '';
				c_colsInput.value = '';
				c_headerCheckbox.data.isChecked = false;
				c_expandCheckbox.data.isChecked = false;
				c_headerCheckbox.style.background = 'transparent';
				c_expandCheckbox.style.background = 'transparent';
			};
			
			var addTable = function()
			{
				if (c_expandCont.data.isExpanded) c_expandCont.onclick();
				if (c_tableOptions.data.isOpen) return;
				c_leftBarWrapper.style.display = 'none';
				c_leftBar.appendChild(c_tableOptions);
				resetTableOptions();
				c_addTable.onclick = function()
				{
					var rows = c_rowsInput.value;
					var cols = c_colsInput.value;
					var header = c_headerCheckbox.data.isChecked;
					var stretch = c_expandCheckbox.data.isChecked;
					var table = document.createElement('table');
					var tbody = document.createElement('tbody');
					table.rules = 'all';
					table.border = '1';
					table.className = 'table';
					table.style.minWidth = cols * 40 + 'px';
					table.cellpadding = 0;
					table.cellspacing = 0;
					if(stretch) table.width = '100%';
					for(var r = 0; r < rows; r++)
					{
						var tr = document.createElement('tr');
						for (var c = 0; c < cols; c++)
						{
							var td = (header && r == 0) ? document.createElement('th') : document.createElement('td');
							td.innerText = '\u200B';
							tr.appendChild(td);
						}
						tbody.appendChild(tr);
					}
					table.appendChild(tbody);
					c_msgBody.contentWindow.focus();
					iframe.execCommand('insertHTML', false, table.outerHTML + '<br/>\u200B');
					updateScroll();
				};
				c_cancelTable.onclick = function()
				{
					c_leftBar.removeChild(c_tableOptions);
					c_leftBarWrapper.style.display = 'block';
					c_tableOptions.data.isOpen = false;
				};
				c_tableOptions.data.isOpen = true;
			};
			
			var insertLink = function()
			{
				var val = getSelectedText();
				if (val == '') return;
				var a = create('a', cssStyles.link._14);
				text(a, val);
				a.href = val;
				a.target = 'blank';
				iframe.execCommand('insertHTML', false, a.outerHTML + '<br/>\u200B');
			};
			
			for (var key in root.res.tools)
			{
				var div = create('div', cssStyles.compose.rightBar.toolbar.icon);
				div.onmousedown = function(event){ var event = event || window.event; event.preventDefault() };
				var callback;
				
				switch(key)
				{
					case 'coords': callback = function(){iframe.execCommand('insertHTML', false, createLink('coords') + '\u200B')}; break;
					case 'player': callback = function(){iframe.execCommand('insertHTML', false, createLink('player') + '\u200B')}; break;
					case 'alliance': callback = function(){iframe.execCommand('insertHTML', false, createLink('alliance') + '\u200B')}; break;
					case 'table': callback = addTable; break;
					case 'link': callback = insertLink; break;
					default: callback = function(){iframe.execCommand(this.data.id, false, null)};
				}
				div.data = {'id': key, 'callback': callback};
				div.onclick = function()
				{
					this.data.callback.call(this);
					if (key != 'table') c_msgBody.contentWindow.focus();
					updateMessage.call(root, ibody.cloneNode(true));
				};
				try
				{
					div.style.backgroundImage = root.res.tools[key];
				}
				catch(e)
				{
					console.log(e.toString());
				}
				c_msgToolbar.appendChild(div);
			}
			
			var updateRecipientsHeight = function()
			{
				c_recipients.style.height = Math.max(28, Math.min(180, c_recipientsCont.offsetHeight)) + 'px';
				console.log(c_recipientsCont.offsetHeight, Math.max(28, Math.min(180, c_recipientsCont.offsetHeight)));
				if (c_recipientsCont.offsetHeight == 0 && root.recipients.length > 0) setTimeout(updateRecipientsHeight, 100);
				else
				{
					c_recipientsSbc.style.visibility = (c_recipientsCont.offsetHeight < 180) ? 'hidden' : 'visible';
					c_recipientsSb.data.update();
					c_recipientsSb.data.scrollToEnd();
				}
			}
			updateRecipientsHeight();
			c_msgSb.data.update();
		}
		
		this.dom.window.compose = composeCont;
		//////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
	},
	
	destruct: function(){},
	
	members:
	{
		iframeContent: null,
		selectedFolder: 'inbox',
		selectedGroup: false,
		selectedMsgs: {'ids': [], 'headers': [], 'checkBoxes': []},
		selectedHeader: null,
		selectedContacts: [],
		selectedPage: 0,
		selectedDraft: null,
		callUpdate: null,
		isLoaded: false,
		generatedHeaders: {},
		generatedSections: [],
		recipients: [],
		completePlayerMatch: false,
		folders: {
			'inbox': {'ids': [], 'msgs': []},
			'outbox': {'ids': [], 'msgs': []},
			'junk': {'ids': [], 'msgs': []},
			'trash': [{'ids': [], 'msgs': []}, {'ids': [], 'msgs': []}],
			'draft': {},
			'documents': {'ids': [], 'msgs': []}
		},
		
		contacts: {
			'friends': [],
			'blocked': []
		},
		
		callMethod: function (fn, args)
		{
			var root = this;
			var callback = function()
			{
				root[fn].call(root, args);
			}
			return callback;
		},
		
		create: function (type, css)
		{
			var elm;
			switch(type)
			{
				case 'textField': elm = document.createElement('input'); elm.type = 'text'; break;
				case 'checkBox': elm = document.createElement('input'); elm.type = 'checkBox'; break;
				default: elm = document.createElement(type);
			}
			
			var iterator = function(obj)
			{
				for(var x in obj) elm.style[x] = obj[x];
			};
			
			var onDown = function(down, over, out)
			{
				elm.addEventListener('mousedown', function(event)
				{
					var el = event.target;
					el.onmouseout = null;
					el.onmouseover = null;
					for (var x in down) el.style[x] = down[x];
					var onUp = function()
					{
						el.onmouseout = function(){for (var x in out) el.style[x] = out[x]};
						el.onmouseover = function(){for (var x in over) el.style[x] = over[x]};
						for (var x in out) el.style[x] = out[x];
						document.removeEventListener('mouseup', onUp, false);
					};
					document.addEventListener('mouseup', onUp, false);
				}, false);
			};
			
			if (css === null) return elm;
			for (var key in css) {
				var prop = css[key];
				switch(key)
				{
					case 'over': elm.onmouseover = function(){iterator(css['over'])}; break;
					case 'out': elm.onmouseout = function(){iterator(css['out'])}; break;
					case 'focus': elm.onfocus = function(){iterator(css['focus'])}; break;
					case 'blur': elm.onblur = function(){iterator(css['blur'])}; break;
					case 'down': onDown(css['down'], css['up'], css['out']); break;
					case 'up': ; break;
					default: elm.style[key] = css[key];
				}
			}
			return elm;
		},
		
		gradient: function (stop1, stop2)
		{
			var browser = navigator.userAgent;
			if (browser.indexOf('Chrome') !== -1) browser = 'chrome';
			else if (browser.indexOf('Firefox') !== -1) browser = 'firefox';
			else browser = 'unsupported';
			var grd = '';
			switch (browser) {
				case 'chrome':
					grd = '-webkit-linear-gradient(top, ' + stop1 + ' 0%, ' + stop2 + ' 100%)';
					break;
				case 'firefox':
					grd = '-moz-linear-gradient(top, ' + stop1 + ' 0%, ' + stop2 + ' 100%)';
					break;
				default:
					alert('your Browser is not supported');
			}
			return grd;
		},
		
		text: function(elm, txt)
		{
			elm.appendChild(document.createTextNode(txt));
		},
		
		size: function(obj)
		{
			if(typeof obj !== 'object') return null;
			var s = 0;
			for (var key in obj) s++;
			return s;
		},
		
		placeHolder: function(input, val)
		{
			input.value = val;
			input.addEventListener('focus', function(){if (input.value == val) input.value = ''; console.log(this.value)}, false);
			input.addEventListener('blur', function(){if (input.value == '') input.value = val; console.log(this.value)}, false);
		},
		
		enableScroll: function(elm, parent, cont)
		{
			var pos, ph = parent.offsetHeight, ch = cont.offsetHeight, elmY, contY;
			var scale = ch / (ph - 20);
			var bh = ph / scale;
			elm.style.height = bh + 'px';
			var update = function()
			{
				elmY = elm.offsetTop;
				contY = cont.offsetTop;
				ph = parent.offsetHeight;
				ch = cont.offsetHeight;
				scale = ch / (ph - 20);
				bh = ph / scale;
				elm.style.height = bh + 'px';
				elm.style.display = (ch <= ph) ? 'none' : 'block';
			};
			var scrollToEnd = function()
			{
				elm.style.top = ph - bh - 10 + 'px';
				cont.style.top = ph - ch + 'px';
			};
			elm.data = {'update': update, 'scrollToEnd': scrollToEnd};
			var onMove = function(event)
			{
				var e = (event) ? event : window.event, dist = e.pageY - pos;
				if(elmY + dist < 10)
				{
					elm.style.top = '10px';
					cont.style.top = 0;
				}
				else if(elmY + dist + bh > ph - 10)
				{
					elm.style.top = ph - bh - 10 + 'px';
					cont.style.top = ph - ch + 'px';
				}
				else
				{
					elm.style.top = elmY + dist + 'px';
					cont.style.top =  contY - scale * dist + 'px';
				}
			};
			
			var onUp = function()
			{
				document.removeEventListener('mousemove', onMove, false);
				document.removeEventListener('mouseup', onUp, false);
			};
			
			elm.onmousedown = function(event)
			{
				var e = (event) ? event : window.event, y = e.pageY;
				e.preventDefault();
				pos = y;
				update();
				if (elm.offsetHeight != bh) elm.style.height = bh + 'px';
				document.addEventListener('mousemove', onMove, false);
				document.addEventListener('mouseup', onUp, false);
			};
			
			var onWheel = function(event){
				var e = (event) ? event : window.event;
				e.preventDefault();
				if (ch < ph) return;
				if (ch == 0) update();
				var delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail) ));
				var ct = cont.offsetTop, et = elm.offsetTop;
				var dist = delta * -20 / scale;
				if(et + dist < 10)
				{
					elm.style.top = '10px';
					cont.style.top = 0;
				}
				else if(et + dist + bh > ph - 10)
				{
					elm.style.top = ph - bh - 10 + 'px';
					cont.style.top = ph - ch + 'px';
				}
				else 
				{
					elm.style.top = et + dist + 'px';
					cont.style.top =  ct - scale * dist + 'px';
				}
			};
			if(cont.hasOwnProperty('removeMouseWheelListener')) cont.removeMouseWheelListener();
			cont.onmousewheel = onWheel;
			cont.addEventListener('DOMMouseScroll', onWheel, false);
			cont.removeMouseWheelListener = function(){this.removeEventListener('DOMMouseScroll', onWheel, false);}
		},
		
		findPlayer: function(txt)
		{
			this.clearPlayersSearch(0);
			var str = txt.replace(/[^a-z A-Z 0-9 \-_]/g, '').toLowerCase();
			if (str == '') return;
			var players = zmail.data.getInstance().players;
			var matches = [], completeMatch = false, count = 0;
			for(var i = 0; i < players.length; i++)
			{
				if ((players[i].pn.toLowerCase().substr(0,str.length) == str) && count < 21)
				{
					matches.push(players[i]);
					count++;
				}
				if (players[i].pn.toLowerCase() == txt.toLowerCase()) completeMatch = true;
			}
			this.completePlayerMatch = completeMatch;
			this.populatePlayersResultsCont(matches);
		},
		
		changePlayerSelection: function(mode)
		{
			var searchBox = this.dom.compose.leftBar.searchBox;
			var mainCont = this.dom.compose.leftBar.results.mainCont;
			var resultsSbc = this.dom.compose.leftBar.results.scrollbarCont;
			var resultsCont = this.dom.compose.leftBar.results.resultsCont;
			var index = searchBox.data.selectedIndex;
			var results = searchBox.data.results;
			var length = results.length;
			var newIndex = (mode) ? (index + 1) % length : (index - 1 < 0) ? length - 1 : index - 1;
			var currentItem = results[index];
			var newItem = results[newIndex];
			currentItem.style.background = 'transparent';
			currentItem.style.color = '#8e8e8e';
			newItem.style.background = '#266589';
			newItem.style.color = '#bcbcbc';
			if (newIndex > 4 && length > 5)
			{
				resultsCont.style.top = -(newIndex - 4) * 49 + 'px';
				resultsSbc.firstChild.style.top = (((resultsSbc.offsetHeight - 20) / resultsCont.offsetHeight) * (newIndex - 4) * 49) + 10 +'px';
			}
			if (newIndex < 4 && length > 5)
			{
				resultsCont.style.top = 0;
				resultsSbc.firstChild.style.top = '10px';
			}
			searchBox.data.selectedIndex = newIndex;
		},
				
		addRecipient: function(name)
		{
			var Item = this.create('div', this.css.compose.leftBar.recipients.recipient.cont);
			var remove = this.create('div', this.css.compose.leftBar.recipients.recipient.remove);
			var mainCont = this.dom.compose.leftBar.recipientsMainCont;
			var cont = this.dom.compose.leftBar.recipientsCont;
			var scrollCont = this.dom.compose.leftBar.recipientsSbc;
			var bar = this.dom.compose.leftBar.recipientsSb;
			var updateScroll = function()
			{
				scrollCont.style.visibility = (cont.offsetHeight > 0 && cont.offsetHeight < 180) ? 'hidden' : 'visible';
				mainCont.style.height = Math.max(28, Math.min(180, cont.offsetHeight)) + 'px';
				bar.data.update();
				bar.data.scrollToEnd();
			};
			var root = this;
			this.text(Item, name);
			this.text(remove, 'X');
			remove.data = {'name': name};
			remove.onclick = function()
			{
				root.dom.compose.leftBar.recipientsCont.removeChild(Item);
				var player = this.data.name, index = root.recipients.indexOf(player);
				if(index > -1) root.recipients.splice(index, 1);
				updateScroll();
			};
			Item.appendChild(remove);
			this.dom.compose.leftBar.recipientsCont.insertBefore(Item, this.dom.compose.leftBar.searchBoxCont);
			this.clearPlayersSearch(1);
			if (this.recipients.indexOf(name) == -1) this.recipients.push(name);
			updateScroll();
		},
		
		clearPlayersSearch: function(type)
		{
			var searchBox = this.dom.compose.leftBar.searchBox;
			var mainCont = this.dom.compose.leftBar.results.mainCont;
			var resultsSbc = this.dom.compose.leftBar.results.scrollbarCont;
			var resultsCont = this.dom.compose.leftBar.results.resultsCont;
			if (type == 1)
			{
				searchBox.value = '';
				searchBox.focus();
			}
			resultsSbc.zm_empty();
			resultsCont.zm_empty();
			resultsCont.style.top = 0;
			mainCont.style.display = 'none';
			searchBox.data.results = [];
			searchBox.data.selectedIndex = 0;
			searchBox.data.isContOpen = false;
			this.completePlayerMatch = false;
		},
		
		populatePlayersResultsCont: function(arr)
		{
			var root = this;
			var resultsCont = this.dom.compose.leftBar.results.resultsCont;
			var cont = this.dom.compose.leftBar.results.mainCont;
			var recipientsCont = this.dom.compose.leftBar.recipientsMainCont;
			var scrollbarCont = this.dom.compose.leftBar.results.scrollbarCont;
			var searchBox = this.dom.compose.leftBar.searchBox;
			var add = function()
			{
				root.addRecipient.apply(root, arguments);
			};
			var items = [];
			for(var i = 0; i < arr.length; i++)
			{
				var style = (i == 0) ? 'contSelected' : 'cont';
				var Item = this.create('div', this.css.compose.leftBar.recipients.searchBox.item[style]);
				var player = this.create('p', this.css.compose.leftBar.recipients.searchBox.item.text);
				var alliance = this.create('p', this.css.compose.leftBar.recipients.searchBox.item.text);
				this.text(player, arr[i].pn);
				this.text(alliance, arr[i].an);
				Item.zm_append([player, alliance]);
				Item.data = {'name': arr[i].pn};
				Item.onclick = function()
				{
					add(this.data.name);
				};
				resultsCont.appendChild(Item);
				items.push(Item);
			}
			cont.style.display = 'block';
			cont.style.height = Math.min(244, arr.length * 49) + 'px';
			cont.style.top = recipientsCont.offsetTop + recipientsCont.offsetHeight + 3 + 'px';
			if(arr.length > 5)
			{
				var bar = this.create('div', this.css.compose.leftBar.recipients.searchBox.scrollbar.bar);
				scrollbarCont.appendChild(bar);
				this.enableScroll(bar, scrollbarCont, resultsCont);
			}
			searchBox.data.isContOpen = true;
			searchBox.data.results = items;
		},
				
		update: function(arr1, arr2)
		{
			console.log('updating');
			if(!this.isLoaded)
			{
				var s = this.storage, j = s.get('junk'), t0 = s.get('trash0'), t1 = s.get('trash1'), d = s.get('draft');
				var doc = s.get('documents'), b = s.get('blocked'), f = s.get('friends');
				this.folders.junk.ids = j;
				this.folders.trash[0].ids = t0;
				this.folders.trash[1].ids = t1;
				this.folders.documents.ids = doc;
				this.folders.draft = d;
				this.contacts.friends = f;
				this.contacts.blocked = b;
				this.isLoaded = true;
			}
			if(arr1 && arr2)
			{
				this.filter(arr1, 0);
				this.filter(arr2, 1);
			}
			var f = this.folders, c = this.contacts, root = this;
			var count = function(r)
			{
				var t = f.trash, d = f.draft, g = ['blocked', 'friends'].indexOf(r);
				var len = function(a){return (!a) ? 0 : a.length;};
				if (g == -1) length = (r == 'draft') ? root.size(d) : (r == 'trash') ? len(t[0].msgs) + len(t[1].msgs) : len(f[r].msgs);
				else length = len(c[r]);
				return (length == 0) ? '' : length;
			};
			this.dom.leftBar.folders.inbox.nodeValue = 'Inbox ' + count('inbox');
			this.dom.leftBar.folders.outbox.nodeValue = 'Outbox ' + count('outbox');
			this.dom.leftBar.folders.draft.nodeValue = 'Draft ' + count('draft');
			this.dom.leftBar.folders.junk.nodeValue = 'Junk ' + count('junk');
			this.dom.leftBar.folders.trash.nodeValue = 'Trash ' + count('trash');
			this.dom.leftBar.folders.documents.nodeValue = 'Documents ' + count('documents');
			this.dom.leftBar.contacts.friends.nodeValue = 'Friends ' + count('friends');
			this.dom.leftBar.contacts.blocked.nodeValue = 'Blocked ' + count('blocked');
			if (this.selectedFolder) this.populateHeaders();
			if (this.selectedGroup) this.populateContacts();
		},
		
		resetMsgCont: function()
		{
			var expandCont = this.dom.rightBar.expandCont;
			if (expandCont.data.isExpanded) expandCont.onclick();
			this.dom.rightBar.msgCont.zm_empty();
			this.dom.rightBar.msgCont.style.top = 0;
			this.selectedMsgBody = [];
		},
		
		filter: function(arr, type)
		{
			console.log('filtering messages');
			var i = {'ids': [], 'msgs': []}, t = {'ids': [], 'msgs': []}, j = {'ids': [], 'msgs': []}, d = {'ids': [], 'msgs': []};
			var trash = this.folders.trash[type].ids, junk = this.folders.junk.ids, draft = this.folders.draft;
			var documents = this.folders.documents.ids;
			for (var n = 0; n < arr.length; n++)
			{
				var id = arr[n].i, msg = arr[n];
				if (trash && (trash.indexOf(id) > -1)) { t.ids.push(id); t.msgs.push(msg); }
				else if ((type == 0) && junk && (junk.indexOf(id) > -1)) { j.ids.push(id); j.msgs.push(msg); }
				else if ((type == 0) && documents && (documents.indexOf(id) > -1)) { d.ids.push(id); d.msgs.push(msg); }
				else { i.ids.push(id); i.msgs.push(msg); }
			}
			if (type == 0)
			{
				this.folders.inbox = i;
				this.folders.trash[0] = t;
				this.folders.junk = j;
				this.folders.documents = d;
			}
			if (type == 1)
			{
				this.folders.outbox = i;
				this.folders.trash[1] = t;
			}
		},
		
		resetComposeContainer: function()
		{
			var recipientsMainCont = this.dom.compose.leftBar.recipientsMainCont;
			var recipientsCont = this.dom.compose.leftBar.recipientsCont;
			var subjectInput = this.dom.compose.rightBar.subject;
			var msgCont = this.dom.compose.rightBar.msgCont;
			this.iframeContent = "";
			this.recipients = [];
			while (recipientsCont.children.length > 1) recipientsCont.removeChild(recipientsCont.firstChild);
			while (msgCont.children.length > 1) msgCont.removeChild(msgCont.lastChild);
		},
		
		addSections: function()
		{
			var iframe = this.dom.compose.rightBar.iframe;
			if(this.generatedSections != null && this.generatedSections.length > 0)
			{
				var msgCont = this.dom.compose.rightBar.msgCont;
				for (var i = 0; i < this.generatedSections.length; i++) msgCont.appendChild(this.generatedSections[i][0]);
				iframe.style.borderBottom = '2px solid #3f3e3e';
			}
			else iframe.style.borderBottom = 'none';
		},
		
		openNewMail: function(type)
		{
			this.resetComposeContainer();
			this.generatedSections = [];
			if (type == 1)
			{
				var contacts = this.selectedContacts;
				var playerSearchBox = this.dom.rightBar.contacts.search;
				for (var i = 0; i < contacts.length; i++) this.addRecipient(this.getPlayerNameById(contacts[i]));
				this.selectedContacts = [];
				this.addSelectedContacts();
				this.populateContacts();
				playerSearchBox.onblur();
			}
			zmail.compose.getInstance().open();
		},
		
		replyToAll: function()
		{
			var msgCont = this.dom.compose.rightBar.msgCont;
			var msg = this.selectedHeader.data.msg;
			this.resetComposeContainer();
			this.addSections();
			this.addRecipient(msg.f);
			for (var i = 0; i < msg.t.length; i++) this.addRecipient(msg.t[i]);
			this.dom.compose.rightBar.subject.value = 'Re: ' + msg.s;
			zmail.compose.getInstance().open();
		},
		
		reply: function()
		{
			var msgCont = this.dom.compose.rightBar.msgCont;
			var msg = this.selectedHeader.data.msg;
			this.resetComposeContainer();
			this.addSections();
			this.dom.compose.rightBar.subject.value = 'Re: ' + msg.s;
			this.addRecipient(msg.f);
			zmail.compose.getInstance().open();
		},
		
		forwardMsg: function()
		{
			var msgCont = this.dom.compose.rightBar.msgCont;
			var msg = this.selectedHeader.data.msg;
			this.resetComposeContainer();
			this.addSections();
			this.dom.compose.rightBar.subject.value = 'Fwd: ' + msg.s;
			zmail.compose.getInstance().open();
		},
		
		sendMail: function()
		{
			var to = this.recipients.join('; ');
			var subject = this.dom.compose.rightBar.subject.value;
			if ((subject == '') || (subject == 'Add Subject:')) subject = 'No subject';
			var date = new Date();
			var from = zmail.data.getInstance().ownerName;
			var clone = this.dom.compose.rightBar.iframe.contentWindow.document.body.cloneNode(true);
			var message = this.encodeMsg(clone);
			date = date.getTime();
			message = '<cnc><cncs>' + from + '</cncs><cncd>' + date + '</cncd><cnct>' + message + '</cnct></cnc>';
			for (var i = 0; i < this.generatedSections.length; i++)
			{
				if(this.generatedSections[i][2] == 1) message += this.generatedSections[i][1];
			}
			zmail.data.getInstance().sendMail(to, "", subject, message)
			console.log(from, to, subject, message);
		},
		
		saveDraft: function()
		{
			var subject = this.dom.compose.rightBar.subject.value;
			var date = new Date();
			var from = zmail.data.getInstance().ownerName;
			var fromId = zmail.data.getInstance().ownerId;
			var clone = this.dom.compose.rightBar.iframe.contentWindow.document.body.cloneNode(true);
			var message = this.encodeMsg(clone);
			if ((subject == '') || (subject == 'Add Subject:')) subject = 'No subject';
			date = date.getTime();
			
			message = '<cnc><cncs>' + from + '</cncs><cncd>' + date + '</cncd><cnct>' + message + '</cnct></cnc>';
			for (var i = 0; i < this.generatedSections.length; i++)
			{
				if(this.generatedSections[i][2] == 1) message += this.generatedSections[i][1];
			}
			var id = (this.selectedDraft) ? parseInt(this.selectedDraft) : date;
			var msg = {'b':message,'r':true,'f':from,'fi':fromId,'t':this.recipients,'s':subject,'d':date,'i':id,'rm':clone.innerHTML};
			if (this.folders.draft == null) this.folders.draft = {};
			this.folders.draft[id] = msg;
			this.selectedDraft = null;
			this.update();
			this.storage.save.call(this);
		},
		
		editDraft: function()
		{
			if(this.selectedFolder == 'draft')
			{
				this.resetComposeContainer();
				var id = this.selectedHeader.data.msg.i;
				var draft = this.folders.draft[id];
				this.recipients = draft.t;
				this.dom.compose.rightBar.subject.value = draft.s;
				this.iframeContent = draft.rm;
				if(this.generatedSections && this.generatedSections.length > 1)
				{
					this.generatedSections.splice(0,1);
					this.addSections();
				}
				this.selectedDraft = id;
				for (var i = 0; i < draft.t.length; i++) this.addRecipient(draft.t[i]);
				zmail.compose.getInstance().open();
			}
		},
		
		deleteDraft: function()
		{
			if (this.selectedFolder == 'draft')
			{
				var ids = this.getSelectedMsgsIds();
				for (var i = 0; i < ids.length; i++)
				{
					if (this.folders.draft.hasOwnProperty(ids[i])) delete this.folders.draft[ids[i]];
				}
				this.selectAll(false);
				this.update();
				this.storage.save.call(this);
			}
		},
		
		encodeMsg: function(cont)
		{
			try
			{
				var getMargin = function(a)
				{
					var m = 0, elm = a;
					while (elm.parentElement)
					{
						if (elm.nodeType == 1) m += parseInt(elm.style.marginLeft) || 0;
						elm = elm.parentElement;
					}
					return m;
				};
				
				var getLinkType = function(a)
				{
					var type;
					if (a.match('webfrontend.gui.util.BBCode.openPlayerProfile')) type = 'player';
					if (a.match('webfrontend.gui.util.BBCode.openAllianceProfile')) type = 'alliance';
					if (a.match('webfrontend.gui.UtilView.centerCoordinatesOnRegionViewWindow')) type = 'coords';
					return type;
				};
				
				var getAttr = function(a)
				{
					var b = '';
					switch(a.nodeName.toLowerCase())
					{
						case 'div': if (a.style.textAlign !== '') b = a.style.textAlign.charAt(0); break;
						case 'a': 
							if (a.attributes.hasOwnProperty('href')) b = 'url';
							if (a['onclick']) b = getLinkType(a.onclick.toString());
							break;
						default: b = '';
					}
					return b;
				};
				
				var parseHTML = function(a)
				{
					var result = '', o = [];
					for(var i = 0; i < a.childNodes.length; i++)
					{
						var elm = a.childNodes[i], nodeName = elm.nodeName.toLowerCase(), nodeType = elm.nodeType, nodeValue = elm.nodeValue;
						var attr = (nodeType == 1 && getAttr(elm) !== '') ?  getAttr(elm) + ']' : ']';
						var nodeText = (elm.innerText) ? elm.innerText : elm.textContent;
						if (nodeType == 1 && elm.children.length == 0)
						{
							if (nodeName == 'div' && attr == ']') result += '\n' + nodeText + '\n';
							else if (nodeName == 'font') result += nodeText;
							else if (nodeName == 'div' && attr != ']') result += '[d' + attr + nodeText + '[/d' + attr;
							else if (nodeName == 'blockquote') result += '[bq' + attr + nodeText + '[/bq' + attr;
							else if (nodeName == 'br') result += '\n';
							else if (nodeName == 'a') result += '[' + attr + nodeText + '[/' + attr;
							else result += '[' + nodeName + attr + nodeText + '[/' + nodeName + ']';
						}
						else if (nodeType == 1 && elm.children.length > 0)
						{
							o.push(elm);
							if (nodeName == 'div' && attr == ']') result += '';
							else if (nodeName == 'div' && attr != ']') result += '[d' + attr;
							else if (nodeName == 'blockquote') result += '[bq' + attr;
							else if (nodeName == 'a') result += '[' + attr;
							else if (nodeName == 'font') result += '';
							else if (nodeName == 'span') result += '';
							else result += '[' + nodeName  + ']';
							result += parseHTML(o[o.length - 1]);
							if (nodeName == 'div' && attr == ']') result += '';
							else if (nodeName == 'div' && attr != ']') result += '[/d' + attr;
							else if (nodeName == 'blockquote') result += '[/bq' + attr;
							else if (nodeName == 'a') result += '[/' + attr;
							else if (nodeName == 'font') result += '';
							else if (nodeName == 'span') result += '';
							else result += '[/' + nodeName  + ']';
						}
						else if (nodeType == 3 && nodeValue && nodeValue.trim() !== '') result += nodeValue;
					}
					return result;
				};
				var encoded = parseHTML(cont);
				return encoded;
			}
			catch(e)
			{
				console.log(e.toString());
				return 'ERROR';
			}
		},
		
		getCharactersCount: function(msg)
		{
			var count = 0;
			if (this.generatedSections && this.generatedSections.length)
			{
				for (var i = 0; i < this.generatedSections.length; i++)
				{
					var cnct = this.generatedSections[i][1].replace(/.*?<cnct>([^<\/cnct>]*)<\/cnct>.*/, '$1');
					if (cnct && this.generatedSections[i][2] == 1) count += cnct.length;
				}
			}
			if (msg) count += msg.length;
			return count;
		},
		
		markRead: function(flag)
		{
			var ids = this.selectedMsgs.ids, headers = this.selectedMsgs.headers, style = (flag) ? 'cont' : 'contUnRead';
			for(var i = 0; i < headers.length; i++)
			{
				var isRead = headers[i].data.isRead;
				var id = headers[i].data.msg.i;
				var index = this.getMsgIndex(id, this.folders.inbox.msgs);
				headers[i].data.isRead = flag;
				headers[i].zm_css(this.css.header[style]);
				if (index > -1) this.folders.inbox.msgs[index].r = flag;
				else console.log('Inbox doesn\'t contain id(' + id + ')');
			}
			this.selectAll(false);
			zmail.data.getInstance().markRead(ids, flag);
		},
				
		selectAll: function(n)
		{
			var selectAllCheckBox = this.dom.middleBar.footer.selectAll;
			var ids = [], headers = [], boxes = [];
			for(var key in this.generatedHeaders)
			{
				var checkBox = this.generatedHeaders[key].checkBox;
				var header = this.generatedHeaders[key].cont;
				header.style.background = (n) ? '#363636' : (header.data.isRead) ? 'transparent' : '#292929';
				header.data.isSelected = n;
				checkBox.data.isChecked = n;
				checkBox.style.background = (n) ? '#9f9f9f' : 'transparent';
				ids.push(parseInt(key));
				headers.push(header);
				boxes.push(checkBox);
			}
			this.selectedMsgs.ids = (n) ? ids : [];
			this.selectedMsgs.headers = (n) ? headers : [];
			this.selectedMsgs.checkBoxes = (n) ? boxes : [];
			selectAllCheckBox.data.isChecked = n;
			selectAllCheckBox.style.background = (n) ? '#9f9f9f' : 'transparent';
			this.selectedHeader = null;
			this.resetMsgCont();
			this.setToolbar();
			console.log(this.selectedMsgs);
		},
		
		getSelectedMsgsIds: function()
		{
			var smIds = this.selectedMsgs.ids, sh = this.selectedHeader;
			var ids = (smIds != null && smIds.length > 0) ? smIds : (sh != null) ? [sh.data.msg.i] : null;
			return ids;
		},
		
		getMsgIndex: function(id, msgs)
		{
			var index = -1;
			for(var i = 0; i < msgs.length; i++)
			{
				if (msgs[i].i == id)
				{
					index = i;
					break;
				}
			}
			return index;
		},
		
		removeMsgFromFolder: function(id, folder)
		{
			var idIndex = this.folders[folder].ids.indexOf(id);
			if (idIndex > -1)
			{
				if (this.folders[folder].msgs[idIndex].i == id)
				{
					var msg = this.folders[folder].msgs[idIndex];
					this.folders[folder].ids.splice(idIndex, 1);
					this.folders[folder].msgs.splice(idIndex, 1);
					return msg;
				}
				else
				{
					var msgIndex = this.getMsgIndex(id, this.folders[folder].msgs);
					var msgId = this.folders[folder].msgs[msgIndex].i;
					if ((msgIndex > -1) && (msgId == id))
					{
						var msg = this.folders[folder].msgs[msgIndex];
						this.folders[folder].ids.splice(idIndex, 1);
						this.folders[folder].msgs.splice(msgIndex, 1);
						return msg;
					}
					else
					{
						if (msgIndex == -1) console.log('Message with id: ' + id + ' could not be found in ' + folder + '!');
						else if (msgId !== id) console.log('id mismatch (' + id + ' - ' + msgId + ')');
						else console.log('something went terribly wrong');
						return false;
					}
				}
			}
			else console.log('id: ' + id + 'does not exist in folder '  + folder);
		},
		
		
		toJunk: function()
		{
			var arr = this.getSelectedMsgsIds();
			if (arr !== null)
			{
				for (var i = 0; i < arr.length; i++)
				{
					var id = arr[i], msg = this.removeMsgFromFolder(id, 'inbox');
					if (msg && this.folders.junk.ids.indexOf(id) == -1)
					{
						this.folders.junk.ids.push(id);
						this.folders.junk.msgs.push(msg);
					}
					if (this.folders.junk.ids.indexOf(id) > -1) console.log('Message with id: ' + id + 'already exists in Junk!');
				}
				this.selectAll(false);
				this.update();
				this.storage.save.call(this);
			}
			else console.log('No messages selected!');
		},
		
		toDocuments: function()
		{
			var arr = this.getSelectedMsgsIds();
			if (arr !== null)
			{
				for (var i = 0; i < arr.length; i++)
				{
					var id = arr[i], msg = this.removeMsgFromFolder(id, 'inbox'), index = this.folders.documents.ids.indexOf(id);
					if (msg && (index == -1))
					{
						this.folders.documents.ids.push(id);
						this.folders.documents.msgs.push(msg);
					}
					if (index > -1) console.log('Message (' + id + ') already exists in Documents!');
				}
				this.selectAll(false);
				this.update();
				this.storage.save.call(this);
			}
			else console.log('No messages selected!');
		},
		
		toTrash: function()
		{
			var arr = this.getSelectedMsgsIds();
			var folder = this.selectedFolder;
			var type = (folder == 'outbox') ? 1 : 0;
			if (arr !== null)
			{
				for (var i = 0; i < arr.length; i++)
				{
					var id = arr[i], msg = this.removeMsgFromFolder(id, folder), index = this.folders.trash[type].ids.indexOf(id);
					if (msg && (index == -1))
					{
						this.folders.trash[type].ids.push(id);
						this.folders.trash[type].msgs.push(msg);
					}
					if (index > -1) console.log('Message (' + id + ') already exists in trash[' + type + ']!');
				}
				this.selectAll(false);
				this.update();
				this.storage.save.call(this);
			}
			else console.log('No messages selected!');
		},
		
		emptyFolder: function()
		{
			var data = zmail.data.getInstance();
			if(this.selectedFolder == 'junk')
			{
				if (this.folders.junk.ids != null && this.folders.junk.ids.length > 0)
				{
					data.deleteMsgs(this.folders.junk.ids, 1);
					this.folders.junk.ids = [];
					this.folders.junk.msgs = [];
				}
			}
			if(this.selectedFolder == 'trash')
			{
				if (this.folders.trash[0].ids != null && this.folders.trash[0].ids.length > 0)
				{
					data.deleteMsgs(this.folders.trash[0].ids, 1);
					this.folders.trash[0].ids = [];
					this.folders.trash[0].msgs = [];
				}
				if (this.folders.trash[1].ids != null && this.folders.trash[1].ids.length > 0)
				{
					data.deleteMsgs(this.folders.trash[1].ids, 0);
					this.folders.trash[1].ids = [];
					this.folders.trash[1].msgs = [];
				}
			}
			this.update();
			this.storage.save.call(this);
		},
		
		notJunk: function()
		{
			var arr = this.getSelectedMsgsIds();
			if(this.selectedFolder == 'junk' && arr !== null)
			{
				for (var i = 0; i < arr.length; i++)
				{
					var id = arr[i], msg = this.removeMsgFromFolder(id, 'junk'), index = this.folders.inbox.ids.indexOf(id);
					if (msg && (index == -1))
					{
						this.folders.inbox.ids.push(id);
						this.folders.inbox.msgs.push(msg);
					}
					if (index > -1) console.log('Message (' + id + ')already exists in inbox!');
				}
				this.selectAll(false);
				this.update();
				this.storage.save.call(this);
			}
			else console.log('No messages selected!');
		},
		
		notTrash: function()
		{
			var arr = this.getSelectedMsgsIds();
			if ((this.selectedFolder == 'trash') && (arr !== null))
			{
				for (var i = 0; i < arr.length; i++)
				{
					var id = arr[i];
					if (this.folders.trash[0].ids.indexOf(id) > -1)
					{
						var idIndex = this.folders.trash[0].ids.indexOf(id);
						var msgIndex = this.getMsgIndex(id, this.folders.trash[0].msgs);
						if (msgIndex > -1)
						{
							var msg = this.folders.trash[0].msgs[msgIndex];
							this.folders.trash[0].ids.splice(idIndex, 1);
							this.folders.trash[0].msgs.splice(msgIndex, 1);
							if (this.folders.inbox.ids.indexOf(id) == -1)
							{
								this.folders.inbox.ids.push(id);
								this.folders.inbox.msgs.push(msg);
							}
							else console.log('id(' + id + ') already exists in Inbox!');
						}
						else console.log('trash[inbox] doesn\'t contain message with id(' + id + ')');
					}
					else if (this.folders.trash[1].ids.indexOf(id) > -1)
					{
						var idIndex = this.folders.trash[1].ids.indexOf(id);
						var msgIndex = this.getMsgIndex(id, this.folders.trash[1].msgs);
						if (msgIndex > -1)
						{
							var msg = this.folders.trash[1].msgs[msgIndex];
							this.folders.trash[1].ids.splice(idIndex, 1);
							this.folders.trash[1].msgs.splice(msgIndex, 1);
							if (this.folders.outbox.ids.indexOf(id) == -1)
							{
								this.folders.outbox.ids.push(id);
								this.folders.outbox.msgs.push(msg);
							}
							else console.log('id(' + id + ') already exists in Inbox!');
						}
						else console.log('trash[inbox] doesn\'t contain message with id(' + id + ')');
					}
					else console.log('trash folder doesn\'t contain id(' + id + ')');
				}
				this.selectAll(false);
				this.update();
				this.storage.save.call(this);
			}
		},
		
		deleteMsg: function()
		{
			var arr = this.getSelectedMsgsIds();
			if (this.selectedFolder == 'trash' && arr !== null)
			{
				var data = zmail.data.getInstance();
				var inbox = [], outbox = [];
				for (var i = 0; i < arr.length; i++)
				{
					var id = arr[i];
					if (this.folders.trash[0].ids.indexOf(id) > -1)
					{
						var idIndex = this.folders.trash[0].ids.indexOf(id);
						var msgIndex = this.getMsgIndex(id, this.folders.trash[0].msgs);
						if(msgIndex > -1)
						{
							inbox.push(id);
							this.folders.trash[0].ids.splice(idIndex, 1);
							this.folders.trash[0].msgs.splice(msgIndex, 1);
						}
						else console.log('trash[inbox] doesn\'t contain a message with id(' + id + ')');
					}
					else if (this.folders.trash[1].ids.indexOf(id) > -1)
					{
						var idIndex = this.folders.trash[1].ids.indexOf(id);
						var msgIndex = this.getMsgIndex(id, this.folders.trash[1].msgs);
						if(msgIndex > -1)
						{
							outbox.push(id);
							this.folders.trash[1].ids.splice(idIndex, 1);
							this.folders.trash[1].msgs.splice(msgIndex, 1);
						}
						else console.log('trash[outbox] doesn\'t contain a message with id(' + id + ')');
					}
					else console.log('trash folder doesn\'t contain id(' + id + ')');
				}
				this.selectAll(false);
				this.update();
				this.storage.save.call(this);
				if (inbox.length > 0) data.deleteMsgs(inbox, 1);
				if (outbox.length > 0) data.deleteMsgs(outbox, 0);
			}
		},
		
		searchFolder: function(str)
		{
			var msgs = this.folders[this.selectedFolder].msgs;
			var m1 = [], m2 = [], sd = [], sb = [], root = this;
			var cont = this.dom.searchResults.cont;
			var fromUl = this.dom.searchResults.sender.list;
			var subjectUl = this.dom.searchResults.subject.list;
			var fromCount = this.dom.searchResults.sender.count;
			var subjectCount = this.dom.searchResults.subject.count;
			fromUl.zm_empty();
			subjectUl.zm_empty();
			cont.style.display = (str == '') ? 'none' : 'block';
			for (var i = 0; i < msgs.length; i++)
			{
				var sender = msgs[i].f, subject = msgs[i].s.toLowerCase(), id = msgs[i].i, str = str.toLowerCase();
				if ((sender.toLowerCase().match(str) !== null) && (sd.indexOf(sender) == -1))
				{
					m1.push([sender, id]);
					sd.push(sender);
				}
				if ((subject.match(str) !== null) && (sb.indexOf(subject) == -1))
				{
					m2.push([subject, id]);
					sb.push(subject);
				}
			}
			(fromCount.innerText) ? fromCount.innerText =  m1.length : fromCount.textContent = m1.length;
			(subjectCount.innerText) ? subjectCount.innerText =  m2.length : subjectCount.textContent = m2.length;
			var printMsg = function()
			{
				root.printMsg.apply(root, arguments);
			};
			for (var a = 0; a < Math.min(5, m1.length); a++)
			{
				var li1 = this.create('li', this.css.searchResults.li.sub);
				var t1 = m1[a][0];
				this.text(li1, (t1.length > 15) ? t1.substr(0, 15) + '...' : t1);
				fromUl.appendChild(li1);
				li1.data = {'sender': m1[a][0], 'folder': this.selectedFolder}; 
				li1.onclick = function()
				{
					var f = this.data.folder, um = [], ui = [];
					var msgs = root.folders[f].msgs;
					if (!msgs) return;
					for (var m = 0; m < msgs.length; m++) if (msgs[m].f == this.data.sender) { um.push(msgs[m]); ui.push(msgs[m].i) };
					root.selectedFolder = 'results';
					root.folders.results = {'ids': ui, 'msgs': um};
					root.populateHeaders();
					root.selectedFolder = this.data.folder;
					cont.style.display = 'none';
				}
			}
			for (var b = 0; b < Math.min(5, m2.length); b++)
			{
				var li2 = this.create('li', this.css.searchResults.li.sub);
				var t2 = m2[b][0];
				this.text(li2, (t2.length > 15) ? t2.substr(0, 15) + '...' : t2);
				subjectUl.appendChild(li2);
				li2.data = {'id': m2[b][1], 'folder': this.selectedFolder}; 
				li2.onclick = function()
				{
					var id = this.data.id, f = this.data.folder;
					var index = root.folders[f].ids.indexOf(id);
					var msg = root.folders[f].msgs[index];
					printMsg(msg);
					cont.style.display = 'none';
				}
			};
		},
		
		storage: 
		{
			'save': function()
			{
				console.log('saving');
				var json = JSON.parse(localStorage.ccta_zmail), folders = {}, contacts = {};
				folders.draft = this.folders.draft;
				folders.junk = this.folders.junk.ids;
				folders.trash = [this.folders.trash[0].ids, this.folders.trash[1].ids];
				folders.documents = this.folders.documents.ids;
				contacts.friends = this.contacts.friends;
				contacts.blocked = this.contacts.blocked;
				console.log(folders, contacts);
				localStorage.ccta_zmail = JSON.stringify({'folders': folders, 'contacts': contacts, 'archive': json.archive});
			},
			
			'get': function(folder)
			{
				var json = JSON.parse(localStorage.ccta_zmail), folders = json.folders, contacts = json.contacts;
				var x = null;
				var size = function(obj)
				{
					if (typeof obj !== 'object') return null;
					var s = 0;
					for (var key in obj) s++;
					return s;
				};
				
				switch(folder)
				{
					case 'draft': if (folders.draft !== null) x = folders.draft; break;
					case 'trash0': if (folders.trash !== null) x = folders.trash[0]; break;
					case 'trash1': if (folders.trash !== null) x = folders.trash[1]; break;
					case 'junk': if (folders.junk !== null) x = folders.junk; break;
					case 'draft': if (folders.draft !== null) x = folders.draft; break;
					case 'documents': if (folders.documents !== null) x = folders.documents; break;
					case 'friends': if (contacts.friends !== null) x = contacts.friends; break;
					case 'blocked': if( contacts.blocked !== null) x = contacts.blocked; break;
				}
				x = (x) ? x : (folder == 'draft') ? {} : [];
				console.log(x, folder);
				return x;
			}
		},
		
		setToolbar: function()
		{
			var folder = this.selectedFolder, selection = this.selectedMsgs, header = this.selectedHeader;
			var type = (selection.ids == null || selection.ids.length == 0) ? (header == null) ? 'default' : 'single' : 'group';
			var toolbarCont = this.dom.topBar.menu;
			var newMsg = this.dom.topBar.toolbar.newMsg;
			var trash = this.dom.topBar.toolbar.trash;
			var delMsg = this.dom.topBar.toolbar.delMsg;
			var junk = this.dom.topBar.toolbar.junk;
			var notJunk = this.dom.topBar.toolbar.notJunk;
			var restore = this.dom.topBar.toolbar.restore;
			var mark = this.dom.topBar.toolbar.mark;
			var reply = this.dom.topBar.toolbar.reply;
			var empty = this.dom.topBar.toolbar.empty;
			var editDraft = this.dom.topBar.toolbar.editDraft;
			var deleteDraft = this.dom.topBar.toolbar.deleteDraft;
			var toDocuments = this.dom.topBar.toolbar.toDocuments;
			var resetBackground = function(){this.style.backgroundImage = 'none'};
			var bars = {
				'inbox':
				{
					'single': [reply, trash, junk, toDocuments, mark],
					'group': [trash, junk, toDocuments, mark],
					'default': []
				},
				'outbox':
				{
					'single': [trash, junk],
					'group': [trash, junk],
					'default': []
				},
				'junk':
				{
					'single': [notJunk, trash, empty],
					'group': [notJunk, trash],
					'default': [empty]
				},
				'trash':
				{
					'single': [restore, delMsg, empty],
					'group': [restore, delMsg],
					'default': [empty]
				},
				'draft':
				{
					'single': [editDraft, deleteDraft],
					'group': [deleteDraft],
					'default': []
				},
			};
			toolbarCont.zm_empty();
			toolbarCont.appendChild(newMsg);
			if (bars.hasOwnProperty(folder))
			{
				bars[folder][type].map(function(key){resetBackground.call(key)});
				toolbarCont.zm_append(bars[folder][type]);
			}
		},
			
		decodeMsg: function(m)
		{
			var match, f = m, create = this.create, cssStyles = this.css, text = this.text;
			var re = /(?:\[(url|player|alliance|coords)\])((?:.(?!\1))+.)(?:\[\/\1\])/g;
			var tags = ['ul', 'ol', 'tr', 'td', 'th', 'table', 'li', 'dr', 'dc', 'dl', 'tbody', 'bq', 'span', 'b', 'i', 'u', 's', 'font'];
			var data = zmail.data.getInstance();
			var BBCode = data.createBBCode;
			var createLink = function(val)
			{
				var a = create('a', cssStyles.link._14);
				text(a, val);
				a.href = val;
				a.target = 'blank';
				return a.outerHTML;
			};
			var convertTag = function(tag)
			{
				var openTag, closeTag, op = new RegExp('\\[' + tag + '\\]', 'g'), cp = new RegExp('\\[\\/' + tag + '\\]', 'g');
				switch(tag)
				{
					case 'dr': openTag = '<div style="text-align: right">'; closeTag = '</div>'; break;
					case 'dc': openTag = '<div style="text-align: center">'; closeTag = '</div>'; break;
					case 'dl': openTag = '<div style="text-align: left">'; closeTag = '</div>'; break;
					case 'bq': openTag = '<div style="margin-left: 40px">'; closeTag = '</div>'; break;
					case 'table': openTag = '<table rules="all" border="1" style="border-color: #999; margin: 10px 0;">'; closeTag = '</table>'; break;
					case 'td': openTag = '<td style="padding: 4px 15px">'; closeTag = '</td>'; break;
					case 'th': openTag = '<th style="background-color: #999; color: #333; padding: 3px 15px;">'; closeTag = '</th>'; break;
					case 'font': openTag = ''; closeTag = ''; break;
					default: openTag = '<' + tag + '>'; closeTag = '</' + tag + '>';
				}
				if (op.test(f)) f = f.replace(op, openTag);
				if (cp.test(f)) f = f.replace(cp, closeTag);
			};
			while((match = re.exec(m)) !== null)
			{
				var code = match[1], val = match[2];
				if(code == 'coords') val = val.split(':');
				switch(code)
				{
					case 'url': f = f.replace(match[0], createLink(val)); break;
					case 'alliance': f = f.replace(match[0], BBCode.alliance(val)); break;
					case 'player': f = f.replace(match[0], BBCode.player(val)); break;
					case 'coords': f = f.replace(match[0], BBCode.coords(val.join(':'), val[0], val[1])); break;
				}
			}
			tags.map(convertTag);
			return f;
		},
		
		formatDate: function(d,t)
		{
			var date = new Date(parseInt(d));
			var day = date.getDate(), month = date.getMonth() + 1, year = date.getFullYear().toString().slice(2), fullYear = date.getFullYear();
			var hours = date.getHours(), minutes = date.getMinutes();
			var newDate = new Date(), today = newDate.getDate(), thisMonth = newDate.getMonth() + 1, thisYear = newDate.getFullYear();
			
			var conv = function(n){ return (n > 9) ? n : '0' + n};
			
			if(day == today && month == thisMonth && fullYear == thisYear && t == 'header')
			{
				return conv(hours) + ':' + conv(minutes);
			}
			else
			{
				var f = conv(day) + '/' + conv(month) + '/' + year;
				if (t == 'header') return f;
				if (t == 'msg') return (f + '  ' + conv(hours) + ':' + conv(minutes));
			}
		},
		
		printMsg: function(msg)
		{
			var b = msg.b, msgCont = this.dom.rightBar.msgCont, cssStyles = this.css, text = this.text, create = this.create, root = this;
			var msgSbc = this.dom.rightBar.scrollBar.cont;
			var sb = this.dom.rightBar.scrollBar.bar;
			var expandCont = root.dom.rightBar.expandCont;
			this.generatedSections = [];
			msgCont.zm_empty();
			var createSection = function(f,d,m,i,c)
			{
				var s_cont = create('div', cssStyles.compose.rightBar.origionalMsg.cont);
				var s_remove = create('div', cssStyles.compose.rightBar.origionalMsg.close);
				var s_from = create('p', cssStyles.compose.rightBar.origionalMsg.from);
				var s_date = create('p', cssStyles.compose.rightBar.origionalMsg.date);
				var s_message = document.createElement('div');
				var s_sender = f.cloneNode(true);
				text(s_from, 'From: ');
				text(s_date, d);
				text(s_remove, 'x');
				s_message.innerHTML = m.replace(/color: ?#377395|color: ?rgb\(55, 115, 149\)/g, 'color: #194965');
				s_remove.data = {'index': i, 'contents': c};
				s_sender.style.color = '#194965';
				s_sender.style.fontSize = '14px';
				s_from.zm_append([s_sender, s_date]);
				s_cont.zm_append([s_from, s_message, s_remove]);
				s_remove.onclick = function()
				{
					var index = this.data.index, sections = root.generatedSections;
					if(sections[index] && sections[index][2] == 1) root.generatedSections[index][2] = 0;
					this.parentNode.remove();
					console.log(root.generatedSections);
				};
				root.generatedSections.push([s_cont, c, 1]);
			};
			
			if(msg.fi === -1)
			{
				var subject = create('p', cssStyles.message.subject);
				var from = create('p', cssStyles.message.from);
				var to = create('p', cssStyles.message.from);
				var msgBody = create('p', cssStyles.message.body);
				var date = create('span', cssStyles.message.date);
	
				text(subject, msg.s);
				text(from, 'From: System');
				text(to, 'To: You');
				text(date, this.formatDate(msg.d, 'msg'));
				msgBody.innerHTML = this.decodeMsg(b);
				from.appendChild(date);
				msgCont.zm_append([subject, from, to, msgBody]);
				this.selectedMsgBody.push(from.outerHTML + msgBody.outerHTML);
			}
			
			if((msg.fi !== -1) && (/<cnc>/.test(b)))
			{
				str = b.replace(/[\t\r\n]/g, '</br>');
				var sections = [];
				var cnc = str.match(/<cnc>.*?<\/cnc>/g);
				var re  = /(?:<(cncs|cncd|cnct)>)((?:.(?!\1))+.)(?:<\/\1>)/g, match;
				
				for(var i = 0; i < cnc.length; i++)
				{
					var sd, dt, txt;
					while ((match = re.exec(cnc[i])) !== null) 
					{
						var tag = match[1], val = match[2];
						switch(tag)
						{
							case 'cncs': sd = val; break;
							case 'cncd': dt = parseInt(val); break;
							case 'cnct': txt = val; break;
						}
					};
					sections.push([sd, dt, txt]);
				}
				console.log(sections);
				
				for(var n = 0; n < sections.length; n++)
				{
					var subject = create('p', cssStyles.message.subject);
					var from = create('p', cssStyles.message.from);
					var msgBody = create('p', cssStyles.message.body);
					var date = create('span', cssStyles.message.date);
					var sender = create('a', cssStyles.link._12);
					text(subject, msg.s);
					text(from, 'From: ');
					text(date, this.formatDate(sections[n][1], 'msg'));
					text(sender, sections[n][0]);
					sender.data = {'name': sections[n][0]};
					sender.onclick = function(){webfrontend.gui.util.BBCode.openPlayerProfile(this.data.name)};
					sender.style.marginRight = 0;
					from.zm_append([sender, date]);
					if (sections[n][2]) msgBody.innerHTML = this.decodeMsg(sections[n][2]);
					
					if(n == 0)
					{
						var to = create('p', cssStyles.message.from);
						var expand = create('span', cssStyles.message.expand);
						var addFriend = create('a', cssStyles.message.actionLink);
						var blockContact = create('a', cssStyles.message.actionLink);
						var add = function(){ root.addFriend.apply(root, arguments) };
						var block = function(){ root.blockContact.apply(root, arguments) };
						var isFriend = (this.contacts.friends) ? this.contacts.friends.indexOf(msg.fi) > -1 : false;
						var isBlocked = (this.contacts.blocked) ? this.contacts.blocked.indexOf(msg.fi) > -1 : false;
						text(to, 'To: ');
						text(addFriend, 'Add to contacts');
						text(blockContact, 'Block');
						addFriend.data = {'id': msg.fi};
						blockContact.data = {'id': msg.fi};
						addFriend.onclick = function(){ add(this.data.id); addFriend.remove(); blockContact.remove(); };
						blockContact.onclick = function(){ block(this.data.id); addFriend.remove(); blockContact.remove(); };
						expand.style.backgroundImage = 'url(' + root.res.expand + ')';
						expand.data = {'isCollapsed': true, 'cont': to, 'bar': null};
						expand.onclick = function()
						{
							if (this.data.isCollapsed)
							{
								this.data.cont.style.whiteSpace = 'normal';
								this.style.backgroundImage = 'url(' + root.res.collapse + ')';
							}
							else
							{
								this.data.cont.style.whiteSpace = 'nowrap';
								this.style.backgroundImage = 'url(' + root.res.expand + ')';
							}
							root.dom.rightBar.scrollBar.bar.data.update();
							this.data.isCollapsed = !this.data.isCollapsed;
						};
						if (!isFriend && !isBlocked) from.zm_append([addFriend, blockContact]);
						
						for(var a = 0; a < msg.t.length; a++)
						{
							var receiver = create('a', cssStyles.link._12);
							var s = (a == msg.t.length - 1) ? msg.t[a] : msg.t[a] + ',';
							receiver.data = {'name': msg.t[a]};
							receiver.onclick = function(){webfrontend.gui.util.BBCode.openPlayerProfile(this.data.name)};
							text(receiver, s);
							to.appendChild(receiver);
						}
						msgCont.zm_append([subject, from, to, msgBody]);
						if (to.scrollWidth > to.offsetWidth) to.appendChild(expand);
					}
					else msgCont.zm_append([from, msgBody]);
					createSection(sender, date.innerHTML, msgBody.innerHTML, n, cnc[n]);
				}
			}
			if (this.selectedFolder == 'inbox') msgCont.appendChild(expandCont);
			msgCont.style.top = 0;
			sb.data.update();
		},
		
		createHeader: function(msg)
		{
			var create = this.create, text = this.text, cssStyles = this.css, root = this;
			var headerCont = create('div', cssStyles.header.cont);
			var sender = create('a', cssStyles.header.sender);
			var date = create('span', cssStyles.header.date);
			var subject = create('p', cssStyles.header.subject);
			var checkBox = create('div', cssStyles.header.checkBox);
			var span = create('span', cssStyles.header.span);
			text(sender, msg.f);
			text(date, this.formatDate(msg.d, 'header'));
			text(subject, msg.s);
			sender.data = {'from': msg.f};
			sender.onclick = function(){webfrontend.gui.util.BBCode.openPlayerProfile(this.data.from)};
			span.appendChild(checkBox);
			headerCont.zm_append([span, sender, date, subject]);
			headerCont.data = {'msg': msg, 'isSelected': false, 'isRead': msg.r};
			if(!msg.r)
			{
				headerCont.zm_css(cssStyles.header.contUnRead);
				span.style.borderBottom = cssStyles.header.contUnRead.borderBottom;
			}
			headerCont.onmouseover = function(){this.style.background = '#363636'};
			headerCont.onmouseout = function()
			{
				var isSelected = this.data.isSelected, isRead = this.data.isRead;
				var color = isSelected ? '#363636' : (isRead) ? 'transparent' : '#292929';
				this.style.background = color;
			};
			headerCont.onclick = function()
			{
				console.log(this.data.msg.i);
				if(!this.data.isRead)
				{
					var id = this.data.msg.i;
					var index = root.folders.inbox.ids.indexOf(id);
					var data = zmail.data.getInstance();
					data.markRead([id], true);
					this.data.isRead = true;
					if (index > -1) root.folders.inbox.msgs[index].r = true;
					if (index > -1) console.log(id, root.folders.inbox.msgs[index]);
				}
				if(root.selectedHeader !== null)
				{
					root.selectedHeader.style.background = (root.selectedHeader.data.isRead) ? 'transparent' : '#292929';
					root.selectedHeader.style.fontWeight = (root.selectedHeader.data.isRead) ? 'normal' : 'bold';
					root.selectedHeader.data.isSelected = false;
				}
				root.selectedHeader = this;
				this.data.isSelected = true;
				this.style.background = '#363636';
				root.printMsg(this.data.msg);
				root.setToolbar();
			};
			checkBox.data = {'id': msg.i, 'isChecked': false, 'cont': headerCont};
			checkBox.onmousedown = function(){this.style.background = '#202020'};
			checkBox.onmouseup = function()
			{
				var isChecked = this.data.isChecked, isRead = this.data.cont.data.isRead;
				var index = root.selectedMsgs.ids.indexOf(this.data.id);
				if(!isChecked)
				{
					if(index == -1)
					{
						root.selectedMsgs.ids.push(this.data.id);
						root.selectedMsgs.headers.push(this.data.cont);
						root.selectedMsgs.checkBoxes.push(this);
					}
					this.style.background = '#9f9f9f';
					this.data.cont.style.background = '#363636';
					this.data.cont.data.isSelected = true;
				}
				if(isChecked)
				{
					if(index > -1)
					{
						root.selectedMsgs.ids.splice(index, 1);
						root.selectedMsgs.headers.splice(index, 1);
						root.selectedMsgs.checkBoxes.splice(index, 1);
					}
					this.style.background = 'transparent';
					this.data.cont.style.background = isRead ? 'transparent' : '#292929';
					this.data.cont.data.isSelected = false;
				}
				console.log(root.selectedMsgs);
				this.data.isChecked = !isChecked;
				if (root.selectedMsgs.ids != null && root.selectedMsgs.ids.length > 0)
				{
					root.selectedHeader = null;
					root.resetMsgCont();
				}
				root.setToolbar();
			};
			
			checkBox.onclick = function(event)
			{
				if(!event) event = window.event;
				event.preventDefault();
				event.stopPropagation();
			};
			return {'cont': headerCont, 'checkBox': checkBox};
		},
			
		populateHeaders: function()
		{
			try
			{
				switch(this.selectedFolder)
				{
					case 'trash': var arr = this.folders.trash[0].msgs.concat(this.folders.trash[1].msgs); break;
					case 'draft':
						var arr = [];
						if (this.folders.draft != null || this.size(this.folders.draft) > 0)
						for (var key in this.folders.draft)
						{
							var msg = this.folders.draft[key];
							arr.push(msg);
						};
					break;
					default: var arr = this.folders[this.selectedFolder].msgs;
				}
				var compare = function(a,b)
				{
					return (a.d < b.d) ? 1 : (a.d > b.d) ? -1 : 0;
				};
				arr = arr.sort(compare);
				var create = this.create, text = this.text, cssStyles = this.css, root = this;
				var headersCont = this.dom.middleBar.headersCont;
				var headersSbc = this.dom.middleBar.scrollBar.cont;
				headersSbc.zm_empty();
				headersCont.zm_empty();
				headersCont.style.top = 0;
				this.resetMsgCont();
				this.selectedHeader = null;
				this.selectedMsgs.ids = [];
				this.selectedMsgs.headers = [];
				this.selectedMsgs.checkBoxes = [];
				this.generatedHeaders = {};
				this.setToolbar();
				if(arr == null) return;
				var Min = this.selectedPage * 30, Max = (this.selectedPage + 1) * 30, pages = Math.ceil(arr.length / 30);
				for(var i = Min; i < Math.min(Max, arr.length); i++)
				{
					var msg = arr[i];
					var header = this.createHeader(msg);
					headersCont.appendChild(header.cont);
					root.generatedHeaders[msg.i] = {
						'cont': header.cont,
						'checkBox': header.checkBox,
						'msg': msg
					};
				}
				
				var selectAll = this.dom.middleBar.footer.selectAll;
				var ind = this.dom.middleBar.footer.indicator;
				var controlCont = this.dom.middleBar.footer.controlCont;
				var pagesCount = this.dom.middleBar.footer.pagesCount;
				selectAll.style.background = 'transparent';
				selectAll.style.display = (arr.length > 0) ? 'block' : 'none';
				if(arr.length > 30)
				{
					var width = 197 / pages;
					controlCont.style.display = 'block';
					ind.style.display = 'block';
					ind.style.width = width + 'px';
					ind.style.marginLeft = this.selectedPage * width + 'px';
					var text = 'Page ' + (this.selectedPage + 1) + '/' + pages;
					(pagesCount.innerText) ? pagesCount.innerText = text : pagesCount.textContent = text;
				}
				if(arr.length < 30)
				{
					ind.style.display = 'none';
					controlCont.style.display = 'none';
					(pagesCount.innerText) ? pagesCount.innerText = '' : pagesCount.textContent = '';
				}
				if(arr.length * 30 > headersSbc.offsetHeight)
				{
					headersSbc.zm_empty();
					var sb = create('div', cssStyles.middleBar.scrollBar.bar);
					sb.style.height = 422 * 422/(arr.length * 30) + 'px';
					this.dom.middleBar.scrollBar.bar = sb;
					headersSbc.appendChild(sb);
					this.enableScroll(sb, headersSbc, headersCont);
				}
			}
			catch(e)
			{
				console.log(e.toString());
			}
		},
		
		findContact: function(txt)
		{
			var players = zmail.data.getInstance().players;
			var root = this;
			var resultsCont = this.dom.rightBar.contacts.contentsCont;
			var cont = this.dom.rightBar.contacts.results;
			var scrollbarCont = this.dom.rightBar.contacts.scrollbarCont;
			var searchBox = this.dom.rightBar.contacts.search;
			var lowerCont = this.dom.rightBar.contacts.lowerCont;
			var arr = [];
			var str = txt.replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
			if (str == '')
			{
				cont.style.display = 'none';
				lowerCont.style.display = 'none';
				return;
			}
			for(var i = 0; i < players.length; i++)
			{
				if (players[i].pn.toLowerCase().substr(0,str.length) == str) arr.push(players[i]);
				if (arr.length >= 20) break;
			}
			var activate = function()
			{
				root.changeContactSelection.apply(root, arguments);
			};
			var items = [];
			resultsCont.zm_empty();
			scrollbarCont.zm_empty();
			searchBox.data.selectedIndex = 0;
			searchBox.data.isContOpen = true;
			searchBox.data.selectedGroup = 'results';
			for(var i = 0; i < arr.length; i++)
			{
				var style = (i == 0) ? 'contSelected' : 'cont';
				var Item = this.create('div', this.css.compose.leftBar.recipients.searchBox.item[style]);
				var player = this.create('p', this.css.compose.leftBar.recipients.searchBox.item.text);
				var alliance = this.create('p', this.css.compose.leftBar.recipients.searchBox.item.text);
				this.text(player, arr[i].pn);
				this.text(alliance, arr[i].an);
				Item.zm_append([player, alliance]);
				Item.data = {'id': arr[i].p, 'index': i};
				Item.onclick = function()
				{
					activate(this.data.index);
				};
				resultsCont.appendChild(Item);
				items.push(Item);
			}
			this.setContactOptions(arr[0].p);
			lowerCont.style.display = 'block';
			cont.style.display = 'block';
			cont.style.height = Math.min(145, arr.length * 49) + 'px';
			cont.style.top = searchBox.offsetTop + 30 + 'px';
			if(arr.length > 5)
			{
				var bar = this.create('div', this.css.rightBar.contacts.results.scrollbar.bar);
				scrollbarCont.appendChild(bar);
				this.enableScroll(bar, scrollbarCont, resultsCont);
			}
			searchBox.data.isContOpen = true;
			searchBox.data.results = items;
		},
		
		changeContactSelection: function(mode)
		{
			var searchBox = this.dom.rightBar.contacts.search;
			var mainCont = this.dom.rightBar.contacts.results;
			var resultsSbc = this.dom.rightBar.contacts.scrollbarCont;
			var resultsCont = this.dom.rightBar.contacts.contentsCont;
			var index = searchBox.data.selectedIndex;
			var results = searchBox.data.results;
			var length = results.length;
			var newIndex = (typeof mode === 'number') ? mode : (mode) ? (index + 1) % length : (index - 1 < 0) ? length - 1 : index - 1;
			var currentItem = results[index];
			var newItem = results[newIndex];
			currentItem.zm_css(this.css.compose.leftBar.recipients.searchBox.item.cont);
			newItem.zm_css(this.css.compose.leftBar.recipients.searchBox.item.contSelected);
			newItem.onmouseout = null;
			if (newIndex > 2 && length > 3)
			{
				resultsCont.style.top = -(newIndex - 2) * 49 + 'px';
				resultsSbc.firstChild.style.top = (((resultsSbc.offsetHeight - 20) / resultsCont.offsetHeight) * (newIndex - 2) * 49) + 10 +'px';
			}
			if (newIndex < 3 && length > 3)
			{
				resultsCont.style.top = 0;
				resultsSbc.firstChild.style.top = '10px';
			}
			searchBox.data.selectedIndex = newIndex;
			this.setContactOptions(newItem.data.id);
		},
		
		setContactOptions: function(id)
		{
			var addToSelection = this.dom.rightBar.contacts.buttons.addToSelection;
			var addAsFriend = this.dom.rightBar.contacts.buttons.addAsFriend;
			var block = this.dom.rightBar.contacts.buttons.block;
			var isFriend = this.contacts.friends.indexOf(id) > -1;
			var isBlocked = this.contacts.blocked.indexOf(id) > -1;
			var isSelected = this.selectedContacts.indexOf(id) > -1;
			addToSelection.innerHTML = (isSelected) ? 'Remove' : 'Add to selection';
			addToSelection.data.mode = (isSelected) ? 'remove' : 'add';
			addAsFriend.innerHTML = (isFriend) ? 'Remove Friend' : 'Add Friend';
			addAsFriend.data.mode = (isFriend) ? 'remove' : 'add';
			block.innerHTML = (isBlocked) ? 'Unblock' : 'Block';
			block.data.mode = (isBlocked) ? 'unblock' : 'block';
			addAsFriend.data.id = id;
			addToSelection.data.id = id;
			block.data.id = id;
			(isBlocked) ? addAsFriend.data.disable() : addAsFriend.data.enable();
			(isFriend) ? block.data.disable() : block.data.enable();
		},
		
		addFriend: function(id)
		{
			if(this.contacts.friends.indexOf(id) == -1) this.contacts.friends.push(id);
			this.dom.leftBar.contacts.friends.nodeValue = 'Friends ' + this.contacts.friends.length;
			if(this.selectedGroup == 'friends') this.populateContacts();
			this.storage.save.call(this);
		},
		
		blockContact: function(id)
		{
			if(this.contacts.blocked.indexOf(id) == -1) this.contacts.blocked.push(id);
			this.dom.leftBar.contacts.blocked.nodeValue = 'Blocked ' + this.contacts.blocked.length;
			if(this.selectedGroup == 'blocked') this.populateContacts();
			this.storage.save.call(this);
		},
		
		removeFriend: function(id)
		{
			if(this.contacts.friends.indexOf(id) > -1) this.contacts.friends.splice(this.contacts.friends.indexOf(id), 1);
			this.dom.leftBar.contacts.friends.nodeValue = 'Friends ' + (this.contacts.friends.length || '');
			if(this.selectedGroup == 'friends') this.populateContacts();
			this.storage.save.call(this);
		},
		
		unblockContact: function(id)
		{
			if(this.contacts.blocked.indexOf(id) > -1) this.contacts.blocked.splice(this.contacts.blocked.indexOf(id), 1);
			this.dom.leftBar.contacts.blocked.nodeValue = 'Blocked ' + (this.contacts.blocked.length || '');
			if(this.selectedGroup == 'blocked') this.populateContacts();
			this.storage.save.call(this);
		},
		
		addToSelection: function(id)
		{
			if(this.selectedContacts.indexOf(id) == -1)
			{
				this.selectedContacts.push(id);
				this.addSelectedContacts();
			}
		},
		
		removeFromSelection: function(id)
		{
			if(this.selectedContacts.indexOf(id) > -1)
			{
				this.selectedContacts.splice(this.selectedContacts.indexOf(id) , 1);
				this.addSelectedContacts();
			}
		},
		
		removeAllSelectedContacts: function()
		{
			var arr = this.selectedContacts, headers = this.generatedHeaders;
			for (var id in headers)
			{
				if(arr.indexOf(parseInt(id, 10)) > -1)
				{
					headers[id].checkBox.style.background = 'transparent';
					headers[id].cont.style.background = 'transparent';
					headers[id].cont.data.isSelected = false;
				}
			};
			this.selectedContacts = [];
			this.addSelectedContacts();
		},
		
		addGroupToSelection: function()
		{
			var arr = this.selectedContacts, headers = this.generatedHeaders;
			for (var id in headers)
			{
				if(arr.indexOf(parseInt(id, 10)) == -1) this.selectedContacts.push(parseInt(id, 10));
				headers[id].checkBox.style.background = '#9f9f9f';
				headers[id].cont.style.background = '#363636';
				headers[id].cont.data.isSelected = true;
			};
			this.addSelectedContacts();
		},
		
		removeGroupFromSelection: function()
		{
			var arr = this.selectedContacts, headers = this.generatedHeaders;
			for (var id in headers)
			{
				if(arr.indexOf(parseInt(id, 10)) > -1) this.selectedContacts.splice(this.selectedContacts.indexOf(parseInt(id, 10)), 1);
				headers[id].checkBox.style.background = 'transparent';
				headers[id].cont.style.background = 'transparent';
				headers[id].cont.data.isSelected = false;
			};
			this.addSelectedContacts();
		},
		
		getPlayerNameById: function(id)
		{
			var data = zmail.data.getInstance();
			var players = data.players;
			var name;
			for (var i = 0; i < players.length; i++) if (players[i].p == id) { name = players[i].pn; break; }
			return name;
		},
		
		getPlayerDataById: function(id)
		{
			var data = zmail.data.getInstance();
			var players = data.players;
			var playerData;
			for (var i = 0; i < players.length; i++) if (players[i].p == id) { playerData = players[i]; break; }
			return playerData;
		},
				
		addSelectedContacts: function()
		{
			var cont = this.dom.rightBar.contacts.cont;
			var header = this.dom.rightBar.contacts.header;
			var root = this;
			var text = this.selectedContacts.length == 0 ? 'No contacts selected.' : this.selectedContacts.length + ' contacts selected';
			(header.innerText) ? header.innerText = text : header.textContent = text;
			cont.zm_empty();
			for(var i = 0; i < this.selectedContacts.length; i++)
			{
				var id = this.selectedContacts[i], name = this.getPlayerNameById(id);
				var Item = this.create('div', this.css.compose.leftBar.recipients.recipient.cont);
				var remove = this.create('div', this.css.compose.leftBar.recipients.recipient.remove);
				this.text(Item, name);
				this.text(remove, 'X');
				remove.data = {'id': id, 'parent': Item};
				remove.onclick = function()
				{
					cont.removeChild(this.data.parent)
					var pid = this.data.id, index = root.selectedContacts.indexOf(pid);
					if(index > -1) root.selectedContacts.splice(index, 1);
				};
				Item.appendChild(remove);
				cont.appendChild(Item)
			}
			if(this.selectedContacts.length > 0)
			{
				this.dom.rightBar.contacts.buttons.removeAll.data.enable();
				this.dom.rightBar.contacts.buttons.message.data.enable();
			}
			else
			{
				this.dom.rightBar.contacts.buttons.removeAll.data.disable();
				this.dom.rightBar.contacts.buttons.message.data.disable();
			}
		},
		
		populateContacts: function()
		{
			try
			{
				var data = zmail.data.getInstance();
				var create = this.create, text = this.text, cssStyles = this.css
				var headersCont = this.dom.middleBar.headersCont;
				var headersSbc = this.dom.middleBar.scrollBar.cont, root = this;
				var selectAll = this.dom.middleBar.footer.selectAll;
				var ind = this.dom.middleBar.footer.indicator;
				var controlCont = this.dom.middleBar.footer.controlCont;
				var pagesCount = this.dom.middleBar.footer.pagesCount;
				var isAllContactsSelected = true;
				(pagesCount.innerText) ? pagesCount.innerText = '' : pagesCount.textContent = '';
				ind.style.display = 'none';
				controlCont.style.display = 'none';
				headersSbc.zm_empty();
				headersCont.zm_empty();
				headersCont.style.top = 0;
				this.setToolbar();
				this.resetMsgCont();
				this.generatedHeaders = {};
				this.dom.rightBar.msgCont.appendChild(this.dom.rightBar.contacts.main);
				
				switch(this.selectedGroup)
				{
					case 'friends': 
						var contacts = [];
						this.contacts.friends.map(function(x)
						{
							var c = root.getPlayerDataById(x);
							c.name = c.pn;
							contacts.push(c);
						});						
					break;
					case 'blocked': 
						var contacts = [];
						this.contacts.blocked.map(function(x)
						{
							var c = root.getPlayerDataById(x);
							c.name = c.pn;
							contacts.push(c);
						});						
					break;
					case 'alliance': var contacts = data.allianceMembers; break;
					case 'commanders': var contacts = data.allianceCommanders; break;
					default: var contacts = false;
				}
				
				var compareRank = function(a,b)
				{
					return (a.roleId > b.roleId) ? 1 : (a.roleId < b.roleId) ? -1 : 0;
				};
				var compareName = function(a,b)
				{
					return (a.name.toLowerCase() > b.name.toLowerCase()) ? 1 : (a.name.toLowerCase() < b.name.toLowerCase()) ? -1 : 0;
				};
				(this.selectedGroup == 'alliance' || this.selectedGroup == 'commanders') ? contacts.sort(compareRank) : contacts.sort(compareName);
				if(!contacts) return;
				
				for(var i = 0; i < contacts.length; i++)
				{
					var contact = contacts[i];
					var id = contact.p || contact.id;
					var playerName = contact.pn || contact.name;
					var contactCont = create('div', cssStyles.header.cont);
					var name = create('a', cssStyles.header.sender);
					var rank = create('p', cssStyles.header.subject);
					var checkBox = create('div', cssStyles.header.checkBox);
					var span = create('span', cssStyles.header.span);
					contactCont.data = {'id': id, 'name': playerName, 'isSelected': false, 'checkBox': checkBox};
					if (this.selectedContacts.indexOf(id) > -1)
					{
						checkBox.style.background = '#9f9f9f';
						contactCont.style.background = '#363636';
						contactCont.data.isSelected = true;
					}
					else isAllContactsSelected = false;
					text(name, playerName);
					text(rank, (contact.an || contact.role) || '');
					name.data = {'name': playerName};
					name.onclick = function(){webfrontend.gui.util.BBCode.openPlayerProfile(this.data.name)};
					name.onmousedown = function(event){if(!event) event = window.event; event.preventDefault(); event.stopPropagation()};
					name.onmouseup = function(event){if(!event) event = window.event; event.preventDefault(); event.stopPropagation()};
					span.appendChild(checkBox);
					contactCont.zm_append([span, name, rank]);
					contactCont.onmouseover = function(){if (!this.data.isSelected) this.style.background = '#363636'};
					contactCont.onmouseout  = function(){if (!this.data.isSelected) this.style.background = 'transparent'};
					contactCont.onmousedown = function(){this.data.checkBox.style.background = '#202020'};
					contactCont.onclick = function()
					{
						var index = root.selectedContacts.indexOf(this.data.id);
						var isSelected = this.data.isSelected;
						if(isSelected)
						{
							this.data.checkBox.style.background = 'transparent';
							this.style.background = 'transparent';
							if (index > -1) root.selectedContacts.splice(index, 1);
						}
						else
						{
							this.data.checkBox.style.background = '#9f9f9f';
							this.style.background = '#363636';
							if (index == -1) root.selectedContacts.push(this.data.id);
						}
						this.data.isSelected = !isSelected;
						root.addSelectedContacts();
					};
					headersCont.appendChild(contactCont);
					
					root.generatedHeaders[id] = {
						'cont': contactCont,
						'checkBox': checkBox,
						'name': playerName
					};
				}
				selectAll.style.display = (contacts.length > 0) ? 'block' : 'none';
				selectAll.style.background = (isAllContactsSelected && contacts.length > 0) ? '#9f9f9f' : 'transparent';
				selectAll.data.isChecked = (isAllContactsSelected && contacts.length > 0);
				
				if(contacts.length * 30 > headersSbc.offsetHeight)
				{
					var sb = create('div', cssStyles.middleBar.scrollBar.bar);
					sb.style.height = 422 * 422/(contacts.length * 30) + 'px';
					headersSbc.appendChild(sb);
					this.enableScroll(sb, headersSbc, headersCont);
				}
			}
			catch(e)
			{
				console.log(e.toString());
			}
		},
		
		dom: {
			'window': 
			{
				'main': null,
				'compose': null
			},
			'leftBar': 
			{
				'folders': 
				{
					'inbox': null,
					'outbox': null,
					'draft': null,
					'junk': null,
					'trash': null,
				},
				'items': {
					'inbox': null,
					'outbox': null,
					'draft': null,
					'junk': null,
					'trash': null,
					'friends': null,
					'blocked': null,
					'alliance': null,
					'commanders': null
				},
				'contacts': 
				{
					'alliance': null,
					'commanders': null,
					'friends': null,
					'blocked': null
				}
			},					
			'rightBar': 
			{
				'cont': null,
				'msgCont': null,
				'expandCont': null,
				'scrollBar': 
				{
					'cont': null,
					'bar': null
				},
				'contacts':
				{
					'main': null,
					'lowerCont': null,
					'header': null,
					'cont': null,
					'search': null,
					'results': null,
					'contentsCont': null,
					'scrollbarCont': null,
					'buttons':
					{
						'removeAll': null,
						'message': null,
						'addToSelection': null,
						'addAsFriend': null,
						'block': null
					}
				}
			},
			'middleBar': 
			{
				'headersCont': null,
				'scrollBar': 
				{
					'cont': null,
					'bar': null,
				},
				'footer':
				{
					'selectAll': null,
					'pagesCount': null,
					'indicator': null,
					'controlCont': null,
				}
			},
			'topBar': 
			{
				'logo': null,
				'menu': null,
				'toolbar':
				{
					'newMsg': null,
					'reply': null,
					'trash': null,
					'delMsg': null,
					'junk': null,
					'notJunk': null,
					'restore': null,
					'mark': null,
					'empty': null
				}
			},
			'toolBar': 
			{
				'delete': null,
				'moveToTrash': null,
				'moveToJunk': null,
				'moveToInbox': null,
				'moveToOutbox': null,
				'compose': null
			},
			'searchResults':
			{
				'cont': null,
				'sender':
				{
					'count': null,
					'list': null
				},
				'subject':
				{
					'count': null,
					'list': null
				}
			},
			'compose':
			{
				'leftBar':
				{
					'recipientsMainCont': null,
					'recipientsCont': null,
					'recipientsSbc': null,
					'recipientsSb': null,
					'searchBox': null,
					'searchBoxCont': null,
					'results':
					{
						'mainCont': null,
						'scrollbarCont': null,
						'resultsCont': null
					},
				},
				'rightBar':
				{
					'iframe': null,
					'subject': null,
					'msgCont': null,
					'charCount': null
				}
			}
		},
		
		css: 
		{
			'window': 
			{
				'background': '#292929',
				'width': '100%',
				'height': '471px',
				'paddingTop': '69px',
				'position': 'relative',
				'fontFamily': 'vrinda',
				'display': 'table'
			},
			'topBar': 
			{
				'main': 
				{
					'width': '100%', 
					'position': 'absolute',
					'top': 0,
					'left': 0
				},
				'cont': 
				{
					'backgroundImage': null,
					'height': '68px',
					'borderBottom': '1px solid rgba(0,0,0,0.56)',
					'width': '100%'
				},
				'logo': 
				{
					'width': '126px',
					'height': '24px',
					'display': 'inline-block',
					'verticalAlign': 'top',
					'padding': '22px 0',
					'textAlign': 'center',
					'fontSize': '18px',
					'fontWeight': 'bold',
					'color': '#cacaca'
				},
				'menu': 
				{
					'display': 'inline-block',
					'verticalAlign': 'top',
					'height': '68px'
				}
			},
			'leftBar': 
			{
				'background': '#3a3b3b',
				'minWidth': '126px',
				'height': '471px',
				'display': 'table-cell',
				'verticalAlign': 'top',
				'position': 'relative'
			},
			'rightBar': 
			{
				'main': 
				{
					'height': '471px',
					'display': 'table-cell',
					'verticalAlign': 'top',
					'width': '100%',
					'position': 'relative'
				},
				'msgMask': 
				{
					'overflow': 'hidden',
					'position': 'relative',
					'height': '471px',
					
				},
				'msgCont': 
				{
					'width': '394px',
					'position': 'absolute',
					'top': 0,
					'padding': '0 30px 0 20px',
					'overflow': 'hidden',
					'width': '100%',
					'boxSizing': 'border-box',
					'MozBoxSizing': 'border-box'
				},
				'scrollBar': 
				{
					'cont': 
					{
						'width': '16px',
						'position': 'absolute',
						'background': '#333333',
						'height': '471px',
						'top': 0,
						'right': 0
					},
					'bar': 
					{
						'width': '16px',
						'background': '#3b3b3b',
						'position': 'absolute',
						'top': '10px',
						'over': {'background': '#424242'},
						'out': {'background': '#3b3b3b'},
						'down': {'background': '#707070'},
						'up': {'background': '#3d3d3d'},
						'pointer': 'cursor'
					}
				},
				'contacts':
				{
					'topWrapper': 
					{
						'width': '100%',
						'paddingBottom': '5px',
						'borderBottom': '1px solid #434343',
					},
					'bottomWrapper':
					{
						'marginLeft': '200px',
						'width': 'auto',
						'paddingTop': '50px',
						'height': '125px'
					},
					'cont': 
					{
						'width': 'auto',
						'height': '193px',
						'border': '1px solid #1f1f1f',
						'background': '#323232',
						'overflow': 'hidden',
						'position': 'relative',
						'padding': '5px 0 0 5px',
						'margin': '5px 0 5px 0'
					},
					'search':
					{
						'width': '188px',
						'border': '1px solid #1f1f1f',
						'background': '#323232',
						'color': '#6c6d6d',
						'fontSize': '12px',
						'marginRight': '5px',
						'paddingLeft': '10px',
						'outline': 'none',
						'focus': {'outline': 'none'},
						'blur': {'outline': 'none'},
						'height': '25px',
						'lineHeigt': '25px',
						'display': 'inline-block',
						'verticalAlign': 'top'
					},
					'results': 
					{
						'cont':
						{
							'position': 'absolute',
							'width': '198px',
							'left': '20px',
							'border': '1px solid #1f1f1f',
							'background': '#323232',
							'display': 'none',
							'maxHeight': '145px',
						},
						'mask':
						{
							'position': 'relative',
							'top': 0,
							'left': 0,
							'width': '186px',
							'height': '100%',
							'overflow': 'hidden'
						},
						'contentsCont':
						{
							'position': 'relative',
							'width': '100%'
						},
						'scrollbar':
						{
							'cont':
							{
								'position': 'absolute',
								'top': 0,
								'right': 0,
								'width': '16px',
								'height': '100%',
								'background': '#363636'
							},
							'bar':
							{
								'position': 'absolute',
								'top': '10px',
								'background': '#3d3d3d',
								'width': '16px',
								'over': {'background': '#424242'},
								'out': {'background': '#3d3d3d'},
								'down': {'background': '#707070'},
								'up': {'background': '#3d3d3d'}
							}
						},
					},
					'button':
					{
						'active':
						{
							'height': '25px',
							'textAlign': 'center',
							'background': '#4e4e4e',
							'color': '#8b8b8b',
							'fontSize': '12px',
							'lineHeight': '25px',
							'over': {'background': '#266589', 'color': '#c2c2c2'},
							'out': {'background': '#4e4e4e', 'color': '#8b8b8b'},
							'cursor': 'pointer',
							'marginTop': '1px'
						},
						'disabled':
						{
							'height': '25px',
							'textAlign': 'center',
							'background': '#3f3f3f',
							'color': '#8b8b8b',
							'fontSize': '12px',
							'lineHeight': '25px',
							'over': {'background': '#3f3f3f', 'color': '#8b8b8b'},
							'out': {'background': '#3f3f3f', 'color': '#8b8b8b'},
							'cursor': 'default',
							'marginTop': '1px'
						}
					}
				}
			},
			'middleBar': 
			{
				'cont': 
				{
					'background': '#2e2e2e',
					'minWidth': '197px',
					'height': '471px',
					'display': 'table-cell',
					'verticalAlign': 'top',
					'position': 'relative'
				},
				'headers': 
				{
					'mask': 
					{
						'width': '180px',
						'height': '422px',
						'display': 'inline-block',
						'verticalAlign': 'top',
						'overflow': 'hidden',
						'position': 'relative'
					},
					'scroll': 
					{
						'position': 'absolute'
					}
				},
				'scrollBar': 
				{
					'cont': 
					{
						'width': '16px',
						'height': '421px',
						'top': 0,
						'right': 0,
						'background': '#333333',
						'borderRight': '1px solid rgba(0,0,0,0.2)',
						'position': 'absolute'
					},
					'bar': 
					{
						'width': '16px',
						'background': '#3b3b3b',
						'position': 'absolute',
						'top': '10px',
						'over': {'background': '#424242'},
						'out': {'background': '#3b3b3b'},
						'down': {'background': '#707070'},
						'up': {'background': '#3d3d3d'},
						'pointer': 'cursor'
					}
				},
				'footer': 
				{
					'cont':
					{
						'width': '197px',
						'background': '#424343',
						'borderRight': '1px solid rgba(0,0,0,0.3)',
						'height': '48px',
						'display': 'inline-block',
						'verticalAlign': 'top',
						'position': 'relative'
					},
					'pagesBar':
					{
						'width': '100%',
						'height': '2px',
						'background': '#377395'
					},
					'indicator':
					{
						'height': '2px',
						'background': '#898989'
					},
					'selectAll':
					{
						'checkBox': 
						{
							'border': '1px solid #5b5e5e',
							'width': '10px',
							'height': '10px',
							'margin': '10px 0 0 5px',
							'cursor': 'pointer'
						},
						'span': 
						{
							'width': '20px',
							'height': '59px',
							'position': 'absolute',
							'left': '2px',
							'top': '2px'
						}
					},
					'pagesControls':
					{
						'cont':
						{
							'width': '85px',
							'height': '20px',
							'position': 'absolute',
							'right': '11px',
							'top': '10px'
						},
						'label':
						{
							'position': 'absolute',
							'left': '30px',
							'top': '10px',
							'padding': 0,
							'height': '20px',
							'lineHeight': '20px',
							'color': '#7f7f7f',
							'display': 'none',
							'fontSize': '12px'
						},
						'icon':
						{
							'width': '20px',
							'height': '20px',
							'backgroundPosition': 'center',
							'backgroundRepeat': 'no-repeat',
							'display': 'inline-block',
							'verticalAlign': 'top',
							'margin': 0,
							'padding': 0,
							'cursor': 'pointer'
						}
					}
				}
			},
			
			'tableCellWrapper':
			{
				'position': 'relative',
				'display': 'block'
			},
			
			'ul': 
			{
				'leftBar': 
				{
					'main': 
					{
						'width': '124px',
						'listStyleType': 'none',
						'padding': 0,
						'margin': '10px 0 0 0'
					},
					'sub': 
					{
						'width': '124px',
						'listStyleType': 'none',
						'padding': 0,
						'margin': 0
					}
				},
				'toolbar': 
				{
					'main': 
					{
						'listStyleType': 'none',
						'margin': 0,
						'padding': 0,
						'height': '68px'
					},
					'sub': 
					{
						'border': '3px solid #404144',
						'display': 'none',
						'borderTop': 'none',
						'background': '#266589',
						'listStyleType': 'none',
						'width': '100%',
						'margin': 0,
						'padding': 0,
						'position': 'absolute',
						'top': '69px',
						'left': '-3px',
						'zIndex': 1000
					}
				}
			},
			'li': 
			{
				'leftBar': 
				{
					'main': 
					{
						'fontSize': '24px',
						'color': '#999999',
						'minHeight': '30px',
						'textIndent': '14px'
					},
					'sub': 
					{
						'fontSize': '12px',
						'color': '#909090',
						'background': 'transparent',
						'height': '20px',
						'lineHeight': '20px',
						'textIndent': '30px',
						'cursor': 'pointer',
						'over': 
						{
							'background': '#545555',
							'color': '#aeaeae'
						},
						'out': 
						{
							'background': 'transparent',
							'color': '#909090'
						}
					},
					'subSelected':
					{
						'fontSize': '12px',
						'color': '#aeaeae',
						'height': '20px',
						'lineHeight': '20px',
						'textIndent': '30px',
						'cursor': 'pointer',
						'background': '#545555',
						'over': 
						{
							'background': '#545555',
							'color': '#aeaeae'
						},
						'out': 
						{
							'background': '#545555',
							'color': '#aeaeae'
						}
					}
				},
				'toolbar': 
				{
					'textOnly': 
					{
						'height': '68px',
						'display': 'inline-block',
						'verticalAlign': 'top',
						'textAlign': 'left',
						'fontSize': '16px',
						'lineHeight': '68px',
						'color': '#cacaca',
						'cursor': 'pointer',
						'padding': '0 10px'
					},
					'withIcon': 
					{
						'height': '68px',
						'display': 'inline-block',
						'verticalAlign': 'top',
						'textAlign': 'left',
						'fontSize': '16px',
						'lineHeight': '68px',
						'color': '#cacaca',
						'cursor': 'pointer',
						'padding': '0 10px 0 45px',
						'position': 'relative'
					},
					'withDrop': 
					{
						'height': '68px',
						'display': 'inline-block',
						'verticalAlign': 'top',
						'textAlign': 'left',
						'fontSize': '16px',
						'lineHeight': '68px',
						'color': '#cacaca',
						'cursor': 'pointer',
						'padding': '0 30px 0 10px',
						'position': 'relative'
					},
					'icon': 
					{
						'width': '30px',
						'height': '30px',
						'position': 'absolute',
						'top': '15px',
						'left': '10px'
					},
					'drop': 
					{
						'width': '20px',
						'position': 'absolute',
						'right': 0,
						'top': 0,
						'height': '68px',
						'lineHeight': '68px',
						'fontWeight': 'bold',
						'over': {'backgroundColor': '#266589'},
						'out': {'backgroundColor': 'transparent'},
						'backgroundPosition': '0 center',
						'backgroundRepeat': 'no-repeat'
					},
					'newIcon': 
					{
						'width': '30px',
						'height': '30px',
						'position': 'absolute',
						'top': '18px',
						'left': '10px',
						'padding': 0,
						'margin': 0,
						'backgroundPosition': 'center',
						'backgroundRepeat': 'no-repeat'
					},
					'sub': 
					{
						'padding': '5px 10px',
						'over': {'background': '#377395', 'color': '#cacaca'},
						'out': {'background': 'transparent', 'color': '#aeaeae'},
						'color': '#aeaeae',
						'fontSize': '12px',
						'height': '20px',
						'lineHeight': '20px',
						'textAlign': 'center',
						'borderBottom': '1px solid #404040',
					}
				}
			},
			'input': 
			{
				'text': 
				{
					'search': 
					{
						'width': '87px',
						'border': '1px solid #1f1f1f',
						'height': '14px',
						'margin': '10px 7px 0 7px',
						'padding': '5px 15px 5px 10px',
						'color': '#333333',
						'fontSize': '12px',
						'background': '#525252',
						'focus': 
						{
							'color': '#aeaeae',
							'outline': 'none'
						},
						'blur': 
						{
							'color': '#333333'
						}
					}
				}
			},
			'header': 
			{
				'sender': 
				{
					'fontSize': '14px',
					'cursor': 'pointer',
					'color': '#377395',
					'height': '20px',
					'lineHeight': '20px',
					'margin': '2px 0 0 0',
					'display': 'block',
					'maxWidth': '96px',
					'display': 'inline-block',
					'textOverflow': 'ellipsis',
					'overflow': 'hidden',
					'whiteSpace': 'nowrap'
				},
				'date': 
				{
					'fontSize': '12px',
					'color': '#4d4d4d',
					'position': 'absolute',
					'height': '15px',
					'right': '10px',
					'top': '8px',
					'fontWeight': 'bold',
					'cursor': 'default'
				},
				'subject': 
				{
					'fontSize': '14px',
					'color': '#909090',
					'width': '100%',
					'height': '30px',
					'marginTop': '5px',
					'textOverflow': 'ellipsis',
					'overflow': 'hidden',
					'whiteSpace': 'nowrap'
				},
				'cont': 
				{
					'width': '150px',
					'height': '49px',
					'borderBottom': '1px solid #292929',
					'position': 'relative',
					'padding': '5px 5px 5px 25px',
					'fontWeight': 'normal'
				},
				'contUnRead': 
				{
					'width': '150px',
					'height': '49px',
					'fontWeight': 'bold',
					'borderBottom': '1px solid #242424',
					'position': 'relative',
					'padding': '5px 5px 5px 25px',
					'background': '#292929'
				},
				'checkBox': 
				{
					'border': '1px solid #5b5e5e',
					'width': '10px',
					'height': '10px',
					'margin': '10px 0 0 5px',
				},
				'span': 
				{
					'width': '20px',
					'height': '59px',
					'position': 'absolute',
					'left': '2px',
					'top': 0,
					'borderBottom': '1px solid #292929',
					'cursor': 'pointer'
				}
			},
			'message': 
			{
				'subject': 
				{
					'color': '#6c6d6d',
					'fontSize': '18px',
					'fontWeight': 'bold',
					'padding': '10px 0 5px 0',
					'width': '100%',
					'borderBottom': '2px solid #3f3e3e',
					'margin': 0
				},
				'date': 
				{
					'fontSize': '12px',
					'color': '#6c6d6d',
					'position': 'absolute',
					'top': '5px',
					'right': '10px'
				},
				'from': 
				{
					'position': 'relative',
					'fontSize': '12px',
					'color': '#6c6d6d',
					'minHeight': '12px',
					'padding': '5px 5% 0 0',
					'margin': '0',
					'display': 'block',
					'whiteSpace': 'nowrap',
					'overflow': 'hidden',
					'maxWidth': '95%'
				},
				'expand':
				{
					'width': '5%',
					'height': '14px',
					'padding': 0,
					'lineHeight': '14px',
					'display': 'block',
					'position': 'absolute',
					'bottom': '2px',
					'background': '#292929',
					'right': 0,
					'cursor': 'pointer',
					'backgroundPosition': 'center',
					'backgroundRepeat': 'no-repeat',
					'opacity': 0.8,
					'over': {'opacity': 1},
					'out': {'opacity': 0.8}
				},
				
				'actionLink':
				{
					'display': 'inline-block',
					'verticalAlign': 'top',
					'color': '#b8b8b8',
					'cursor': 'pointer',
					'marginLeft': '20px',
					'opacity': 0.8,
					'over': {'opacity': 1},
					'out': {'opacity': 0.8}
				},
				
				'body': 
				{
					'fontSize': '14px',
					'color': '#848585',
					'marginTop': '30px',
					'paddingBottom': '20px',
					'borderBottom': '1px solid #3f3e3e'
				}
			},
			'link': 
			{
				'_12': 
				{
					'fontSize': '12px',
					'color': '#377395',
					'textDecoration': 'none',
					'cursor': 'pointer',
					'marginRight': '10px',
					'display': 'inline-block'
				},
				'_14': 
				{
					'fontSize': '14px',
					'color': '#377395',
					'textDecoration': 'none',
					'cursor': 'pointer'
				}
			},
			'searchResults':
			{
				'cont':
				{
					'border': '1px solid #1f1f1f',
					'background': '#266589',
					'position': 'absolute',
					'top': '37px',
					'left': '7px',
					'width': '112px',
					'display': 'none'
				},
				'li':
				{
					'main':
					{
						'margin': 0,
						'padding': 0
					},
					'sub':
					{
						'color': '#969696',
						'borderBottom': '#404040',
						'textIndent': '15px',
						'cursor': 'pointer',
						'over': {'background': '#377395', 'color': '#b4b4b4'},
						'out': {'background': 'transparent', 'color': '#969696'},
						'fontSize': '12px',
						'height': '19px',
						'lineHeight': '20px',
						'borderBottom': '1px solid #377395'
					}
				},
				'count':
				{
					'color': '#919090',
					'position': 'absolute',
					'fontSize': '12px',
					'right': '10px',
					'top': '2px'
				},
				'ul':
				{
					'listStyleType': 'none',
					'margin': 0,
					'padding': 0,
					'width': '100%'
				},
				'text':
				{
					'position': 'relative',
					'backgroundImage': '',
					'borderBottom': '1px solid rgba(0,0,0,0.30)',
					'height': '24px',
					'color': '#292929',
					'fontSize': '12px',
					'margin': 0,
					'padding': '0 5px',
					'lineHeight': '24px'
				}
			},
			'compose':
			{
				'window':
				{
					'background': '#292929',
					'width': '100%',
					'height': '471px',
					'paddingTop': '69px',
					'position': 'relative',
					'fontFamily': 'vrinda',
					'display': 'table'
				},
				'topBar':
				{
					
				},
				'leftBar':
				{
					'cont':
					{
						'minWidth': '256px',
						'position': 'relative',
						'background': '#3a3b3b',
						'height': '471px',
						'display': 'table-cell',
						'verticalAlign': 'top'
					},
					'recipients':
					{
						'toText':
						{
							'color': '#8d8c8c',
							'fontSize': '12px',
							'margin': '10px 0 5px 15px'
						},
						'main':
						{
							'position': 'relative',
							'border': '1px solid #1f1f1f',
							'background': '#323232',
							'width': '238px',
							'margin': '0 auto',
							'minHeight': '20px',
							'maxHeight': '180px'
						},
						'mask':
						{
							'position': 'relative',
							'overflow': 'hidden',
							'width': '100%',
							'height': '100%',
							'maxHeight': '180px'
						},
						'cont':
						{
							'padding': '5px 20px 0 5px',
							'position': 'absolute',
							'boxSizing': 'border-box',
							'MozBoxSizing': 'border-box',
							'width': '100%',
							'lineHeight': '10px'
						},
						'scrollbar':
						{
							'cont':
							{
								'position': 'absolute',
								'top': 0,
								'right': 0,
								'width': '16px',
								'height': '100%',
								'maxHeight': '180px',
								'background': '#363636'
							},
							'bar':
							{
								'position': 'absolute',
								'top': '10px',
								'background': '#3d3d3d',
								'width': '16px',
								'over': {'background': '#424242'},
								'out': {'background': '#3d3d3d'},
								'down': {'background': '#707070'},
								'up': {'background': '#3d3d3d'}
							}
						},
						'recipient':
						{
							'cont':
							{
								'margin': '0 5px 5px 0',
								'background': '#266589',
								'color': '#bcbcbc',
								'fontSize': '12px',
								'height': '20px',
								'lineHeight': '20px',
								'padding': '0 20px 0 10px',
								'textOverflow': 'ellipsis',
								'maxWidth': '100%',
								'overflow': 'hidden',
								'display': 'inline-block',
								'position': 'relative'
							},
							'remove':
							{
								'position': 'absolute',
								'top': 0,
								'right': 0,
								'width': '15px',
								'height': '20px',
								'lineHeight': '20px',
								'color': '#bcbcbc',
								'over': {'background': '#377395'},
								'out': {'background': 'transparent'},
								'fontSize': '10px',
								'textAlign': 'center',
								'cursor': 'pointer'
							}
						},
						'textField':
						{
							'height': '15px',
							'lineHeight': '15px',
							'maxWidth': '100%',
							'minWidth': '20%',
							'width': '90%',
							'border': 'none',
							'background': 'transparent',
							'outline': 'none',
							'focus': {'outline': 'none', 'background': 'transparent'},
							'blur': {'outline': 'none', 'background': 'transparent'},
							'color': '#919191',
							'margin': 0,
							'padding': '0 5px 5px 0'
						},
						'textFieldCont':
						{
							'display': 'block',
							'margin': 0,
							'padding': 0,
							'lineHeight': '10px'
						},
						'searchBox':
						{
							'cont':
							{
								'border': '1px solid #1f1f1f',
								'background': '#323232',
								'position': 'absolute',
								'left': '7px',
								'width': '243px',
								'maxHeight': '244px',
								'display': 'none'
							},
							'mask':
							{
								'width': '227px',
								'height': '100%',
								'overflow': 'hidden',
								'position': 'relative'
							},
							'scrollbar':
							{
								'cont':
								{
									'position': 'absolute',
									'top': 0,
									'right': 0,
									'width': '16px',
									'height': '100%',
									'background': '#363636'
								},
								'bar':
								{
									'position': 'absolute',
									'top': '10px',
									'background': '#3d3d3d',
									'width': '16px',
									'over': {'background': '#424242'},
									'out': {'background': '#3d3d3d'},
									'down': {'background': '#707070'},
									'up': {'background': '#3d3d3d'}
								}
							},
							'itemsCont':
							{
								'width': '100%',
								'position': 'absolute',
								'top': 0
							},
							'item':
							{
								'cont':
								{
									'height': '48px',
									'borderBottom': '1px solid #3e3e3e',
									'color': '#8e8e8e',
									'background': 'transparent',
									'over': {'background': '#266589', 'color': '#bcbcbc'},
									'out': {'background': 'transparent', 'color': '#8e8e8e'}
								},
								'contSelected':
								{
									'height': '48px',
									'borderBottom': '1px solid #3e3e3e',
									'color': '#bcbcbc',
									'background': '#266589'
								},
								'text':
								{
									'fontSize': '14px',
									'textOverflow': 'ellipsis',
									'height': '15px',
									'lineHeight': '15px',
									'padding': '5px 10px 0 10px',
									'margin': 0
								}
							}
						}
					},
					'contacts':
					{
						'cont':
						{
							'position': 'absolute',
							'bottom': 0
						}
					},
					'tableOptions':
					{
						'button':
						{
							'height': '25px',
							'width': '40%',
							'margin': '50px 0 0 15px',
							'textAlign': 'center',
							'background': '#4e4e4e',
							'color': '#8b8b8b',
							'fontSize': '12px',
							'lineHeight': '25px',
							'over': {'background': '#266589', 'color': '#c2c2c2'},
							'out': {'background': '#4e4e4e', 'color': '#8b8b8b'},
							'cursor': 'pointer',
							'display': 'inline-block'
						},
						'inputCont':
						{
							'position': 'relative'
						},
						'input':
						{
							'width': '150px',
							'border': '1px solid #1f1f1f',
							'background': '#323232',
							'color': '#6c6d6d',
							'fontSize': '12px',
							'margin': '10px 15px 0 15px',
							'paddingLeft': '10px',
							'outline': 'none',
							'focus': {'outline': 'none'},
							'blur': {'outline': 'none'},
							'height': '23px',
							'lineHeigt': '25px'
						},
						'label':
						{
							'display': 'inline-block',
							'verticalAlign': 'top',
							'height': '25px',
							'marginTop': '10px',
							'lineHeight': '25px',
							'color': '#6c6d6d',
							'fontSize': '12px'
						},
						'span':
						{
							'position': 'absolute',
							'top': '-5px',
							'left': '25px',
							'height': '20px',
							'lineHeight': '20px',
							'color': '#6c6d6d',
							'width': '190px',
							'fontSize': '12px'
						},
						'checkbox':
						{
							'border': '1px solid #5b5e5e',
							'width': '10px',
							'height': '10px',
							'margin': '15px 0 0 15px',
							'cursor': 'pointer',
							'position': 'relative'
						}
					}					
				},
				'rightBar':
				{
					'cont': 
					{
						'height': '471px',
						'display': 'table-cell',
						'verticalAlign': 'top',
						'position': 'relative',
						'width': '100%'
					},
					'msgMask': 
					{
						'overflow': 'hidden',
						'position': 'relative',
						'height': '471px',
						'width': 'inherit',						
					},
					'msgCont': 
					{
						'width': '100%',
						'position': 'absolute',
						'top': 0,
						'overflowX': 'hidden',
						'padding': '107px 30px 20px 20px',
						'boxSizing': 'border-box',
						'MozBoxSizing': 'border-box'
					},
					'msgHeader':
					{
						'position': 'absolute',
						'top': 0,
						'left': 0,
						'padding': '0 30px 0 14px',
						'boxSizing': 'border-box',
						'MozBoxSizing': 'border-box',
						'background': '#292929',
						'width': '100%'
					},
					'scrollBar': 
					{
						'cont': 
						{
							'width': '16px',
							'position': 'absolute',
							'background': '#333333',
							'height': '471px',
							'top': 0,
							'right': 0
						},
						'bar': 
						{
							'width': '16px',
							'background': '#3b3b3b',
							'position': 'absolute',
							'top': '10px',
							'over': {'background': '#424242'},
							'out': {'background': '#3b3b3b'},
							'down': {'background': '#707070'},
							'up': {'background': '#3d3d3d'},
							'pointer': 'cursor'
						}
					},
					'textField':
					{
						'color': '#6c6d6d',
						'fontSize': '18px',
						'fontWeight': 'bold',
						'width': '100%',
						'border': 'none',
						'borderBottom': '2px solid #3f3e3e',
						'margin': '0',
						'padding': '10px 0 5px 0',
						'outline': 'none',
						'background': 'transparent',
						'focus': {'outline': 'none'},
						'blur': {'outline': 'none'},
						'height': '25px',
						'lineHeigt': '25px'
					},
					'textArea':
					{
						'margin': 0,
						'padding': 0,
						'border': 'none',
						'width': '100%',
						'minHeight': '30px',
						'height': '100px',
						'cursor': 'text'
					},
					'expand':
					{
						'position': 'absolute',
						'top': '7px',
						'right': '27px',
						'backgroundPosition': 'center',
						'backgroundRepeat': 'no-repeat',
						'width': '30px',
						'height': '30px',
						'opacity': 0.6,
						'cursor': 'pointer',
						'over': {'opacity': 1},
						'out': {'opacity': 0.6}
					},
					'toolbar':
					{
						'cont':
						{
							'height': '20px',
							'margin': '10px 0 20px 0'
						},
						'icon':
						{
							'display': 'inline-block',
							'verticalAlign': 'top',
							'cursor': 'pointer',
							'backgroundRepeat': 'no-repeat',
							'backgroundPosition': 'center',
							'width': '26px',
							'height': '20px',
							'opacity': 0.5,
							'over': {'opacity': 0.8},
							'out': {'opacity': 0.5}
						},
					},
					'origionalMsg':
					{
						'cont':
						{
							'width': '100%',
							'background': '#747474',
							'color': '#292929',
							'position': 'relative',
							'border': '1px solid #1d1d1d',
							'fontSize': '14px',
							'padding': '20px',
							'boxSizing': 'border-box',
							'MozBoxSizing': 'border-box',
							'margin': '10px 0'
						},
						'close':
						{
							'width': '20px',
							'height': '20px',
							'position': 'absolute',
							'top': '3px',
							'right': '3px',
							'color': '#080808',
							'textAlign': 'center',
							'lineHeight': '20px',
							'fontSize': '12px',
							'fontWeight': 'bold',
							'cursor': 'pointer'
						},
						'date': 
						{
							'fontSize': '12px',
							'position': 'absolute',
							'top': '5px',
							'right': '12px',
							'margin': 0
						},
						'from': 
						{
							'position': 'relative',
							'fontSize': '14px',
							'paddingTop': '5px',
							'margin': '0 0 10px 0',
							'fontWeight': 'bold'
						},
					}
				}
			}
		},
		
		res:
		{
			'controls':
			{
				'next': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAXUlEQVQYV2Oct3DhBsZ//xISExM/MOABjPMXLvzP8P//AyAGqk08gEstRCECNCTGxzdiU4yukAGoa2FSfHwCumJ0hY1AExtwmgg05SHUQ7jdSLSv8QUJshwj1RUCALdQMQvYKq1HAAAAAElFTkSuQmCC',
				'previous': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAZUlEQVQYV2NkwALmz58vwMDIOD8xISEQJs2Irg6oyAGkCIgVEuPj4fIoCucvXNgA1FgP04xV4byFCxcAdcUj20CZiTCTQG78z8QEMl0ep4lIigVAipPi4wNw+hpbcIHEMIKHYoUATvMeC0yTB00AAAAASUVORK5CYII=',
				'first': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAd0lEQVQYV2Ocv3DhfwYg+PfnD19ycvJnEHv+/PkCDIyM8xMTEgJBfBBgRFcIVOQAUgTEConx8YxYFTKxsBQDJephktgV/v+/lImRMRqmCERTaCLUMyA3/mdiWgB0nDxOE5F9DVKcFB8fAPcMspvwseHeJ6SBaIUAZidKC2YCLWUAAAAASUVORK5CYII=',
				'last': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAdElEQVQYV2Oct3DhBsZ//xISExM/MADB3LlzeZlYWD6B2Inx8YwgGgQY5y9c+J/h//8HQAxUm3gAv0KYNgaGhn9//vThNhGhkOHf//9LmRgZo7FbjVDYCDSxF6eJ/xkYHkI9hNuNRPsayXl4mfBwIqSBaIUAjElLC7H537YAAAAASUVORK5CYII='
			},
			'tools':
			{
				'bold': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAAjElEQVQ4jeXSIQoCURCA4QWrYLJ6AMEqWD2DN/AYJu+xySSYBG9gtQqCYLIKewDhs0xYlo3zBPGHgceUD4ZXVX8balw6s8M0Gzrr74VJNtTEe4AlnoGti0Ct3b44hBUa3DHMhro9vv0Z5tlQ+3QjbAI7FoNiNw7oVhraBnTKhvp6Y1ESuuKAWRryU30AvDon2Jg0sc0AAAAASUVORK5CYII=)',
				'italic': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAAbElEQVQ4jc3SsQmDUABFUSshrZWQDQIOIKQSskoqIasEUrmKYBVwEsEqM5w02UD+I3eB09yq+udQo0tAPdYEdMeUgJ54JKAZtwS04VwaafApivygK94JKHbcC2MCWjAkoB1taSR23AmX4tCRvtMVYAewYq2yAAAAAElFTkSuQmCC)',
				'underline': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAAjElEQVQ4je3TsQkCQRBG4QNBuMgabMJW7OBSwcgChIss4DoQTO3ASDC1BlMjo4PPwAEvWRB2OQzuRcP+MI8ZZqvqn8ATbSLb+bCYRJNodFFdQvRAl8ha9NmSaHbBNZGdcS8l2sZ6DpgP3hv02JcSzXD05YZX1KehvJRwiXVMtsGqqGAU4rR/Jf8v5fIG4y4UzcoLKWQAAAAASUVORK5CYII=)',
				'fontColor': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAAnUlEQVQ4jeWSUQ2AMAwFkYAEJEwCEpCABCQgAQmTgoRJQMIcHD9tWCCULGwJCS9p0o+2t66vaTIE9Bzqc3qzBPgE5GtBWiACAdgkb2uARtlkBCbNa4CCbiEBEEpD3Pkuyb1cSdBlaOJAb7RmgyL3iqUgaoIVmE+xFjNFMuxyC2DQR7yFdDJoM2r0W7s3oEWGLEaNf6r5hgyXmfoPaAdIK7bxpwVYhAAAAABJRU5ErkJggg==)',
				'highlight': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAAbklEQVQ4je3SUQ2AMAyE4UlAyiRMwiRMAlKQgASk4eDnpSzNAsmStXuBE9AvvVwIAwEKcAJx5E4PcscHa5CKzUAAyo88IdkdESjKslyRVWrTmDmS9AeCZWtkaeraTAEFJeAQZHdBpuVlyt35BnQBq8S/rmUi4OkAAAAASUVORK5CYII=)',
				'player': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAAoUlEQVQ4jc3PsQpBYQCG4VMmk9XkJpTJBSjX4AJMymo6ZTIppUzuQLkMk9WkTCYXoNRjIcrf4fSfv7wX8D19WfaPoYERJminQpo4e3VDPwWU+2yXAloHoFMKqBeA5pVDD2z+hhxQT4FMA4+2qFWJjAPIs2VVSAvXAggGVUCLLwgcYpEaLj9A0I2BOj8ikMdAwxLQJgaalYD2MdCqBHQs2roDRL7rpNTLvRUAAAAASUVORK5CYII=)',
				'alliance': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAABGklEQVQ4jc3U0UdDYRjH8RGxq66ivyEiRv9EtxG7jRGxq4gRIyJijIjoPxgR3XYVY3Q1RoyuInYVMcani206PXsdOxT9rs55/J7f93nf876nVPqPwhrqaKDyV5ANvPnWBLu/FVzHKXbQtKhu9BWFbOIjE9jHbQL0ilao1YqArkPzBNUEqIWnCC8CaiRCj8P0A1QSvscioDIeMs1dXCZC71DLvL9gqwhoH++z5r70QZjrCu3Z8ycusLoM5DAEHWCcA4IjjMJKV/Ig26Yffq5eZto8DXAeavU8UCeYT8KkeYo7MUI5BVkPq0k156np558DqinQXjCNTW/8surgPtRuUqCzYBqanqBl9WzxovdSoGhKNeZpaPFADOf5X3Iixhnv5aZoAAAAAElFTkSuQmCC)',
				'coords': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAA00lEQVQ4jc3SIQoCQRTG8YVNWz2AYDIJpk0eYGGryQMIgrDJKphMgskDmASrJzGZBGFBEASTICz8DY7weDiLzkzwi/Ox78fOvCj6twApsAPOvHICtkA7JDIDKj7nDgxDIIUYegFSc54BD9HlPkgCXMWwQvVL0R18oFxdk4YWqu+4QhM16Ai0TNcFbqrvu0IjywKUlnO3dwJ6loG2NF0hvQx12TshAtMPbsvYF2p88VclkHhBBhvUIBWQeSMCW1mgaTDEQDGwVsgGiINCAnwvx/yX757Sbx5xpkiHLQAAAABJRU5ErkJggg==)',
				'table': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAAgUlEQVQ4je3RIQ6DQBRFUSyKBIvForqnJii2UlvFhpqQsIbaWuzBjJ0MM2JSwUuee/k3P7dpIkGLR2bb2L1oMMnP9NegEQc2fBLdwnbMBgXYju7CrsNeBKkGwoAfVrwTXcN2KAH1+GLBM9ElbPvSr25Ht6OKoNqOXpgvOJrDNuroBLUtQ3//HcJ5AAAAAElFTkSuQmCC)',
				'insertunorderedList': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAAO0lEQVQ4jWNgGEjw//9/g////z/4//+/Aa0tevAfAh4giRENSLEIw0c0sWj4gdHEMJoY4GA0MYzMxAAA6QxndHKcgPEAAAAASUVORK5CYII=)',
				'insertorderedList': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAAcElEQVQ4je3SMQ2AQAxG4UpBAhKQgDSkIOEkIAEJOPhYbrgQBiCUiTe2aV7b/BEnYIGz3qugP4rc4K4sX/R4ux+s9XNLtqjDgLWppYRhqFeN2SJVVC4P/UREoGD7KnUFc1NLCUOHqR3KEpWautdetwOK5H3Pn7B4CQAAAABJRU5ErkJggg==)',
				'indent': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAAUUlEQVQ4jdWRwQkAIAwD3X+KbBq/UiIF20p7z2A8jGt1hYLZohJI4peIVqamC095dCGyuOjSh1sMvKRWJIQQWfxvzKUQWboI7qHxpE7WQvTKBmYgK+hcRGVIAAAAAElFTkSuQmCC)',
				'outdent': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAAS0lEQVQ4jWNgGEzgPxYwtC0aVOD///8LyNFEEKBbQlZwkmIRzBKaxhuyJTRNKFSziG5BR4xFyJaRbRGJjlpAF4uoAuiSsuhqETUAAAP+K+ha7EZ4AAAAAElFTkSuQmCC)',
				'justifyleft': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAALElEQVQ4jWNgGEjwn0Iw+CwafoBuQTUaJ2QDUoOO7KCkm0XDD9AtqIZ0nAAA5z6+ULjEuxYAAAAASUVORK5CYII=)',
				'justifycenter': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAALElEQVQ4jWNgGEjwn0Iw+Cwa3oBuwTUaLyQB8hI1GcFIN4uGN6BbcA25eAEAdxKecO5FA68AAAAASUVORK5CYII=)',
				'justifyright': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAALElEQVQ4jWNgGEjwn0Iw+Cwa/oBuQTcaR0QDUoOK7KCjm0XDH9At6IZUHAEA8oq+UNVXS0cAAAAASUVORK5CYII=)',
				'link': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAAiElEQVQ4je2S3Q2AIAyEHcFRGIERGIERHIERGMURGMUR3ODzwWoqIUZ8MJhwSV96lOvPDUPHbwEEIGXhFG8KfHgjAjADFvDAIjkLjMAq4SU3C/9cTD5IVd3tdQlYawrOztR0d7i8bVLos9UdU0Q59KSOPwJO+EWZIVabQYnl9jWKdwW+TqSjKWyaolPi2Vd/5AAAAABJRU5ErkJggg==)',
//				'emotions': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAABBklEQVQ4jbWVwZGDMAxFXQIlUEJKoBRKoASXQgkpYUvgHIt5ogN34BzWyng8hGB2oxkO0gh96+vLdu6EAf0Kkyg/5bfCBPRnany0AF6UZIUDDAGGFaagLKKkAP5PILIxixIDDAcHGUSJsjFfAsmdxAfcPuU+4JYP5JtAgD5TMpi/11UZz52lppkZ/+bn4UegK/PqeFCWFabTQDb4wo+ipJrGOm7KPA0UlOVIAG//+6XvOtARHXmXuktAu9TBWOeZaEwAzdTVYtiTOtDlhX0VbhZDLW/nnJONuyhJNubXIitLRVubvN91ITAG8AG8wGgglxe26OL7V1BRyIuSjP+vXKpm//FMPAHSdrKARyrVTwAAAABJRU5ErkJggg==)',
//				'fontFamily': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAAtUlEQVQ4je2SSw0EIQxARwoSkLASkDASRsJKGAlIQAISkIAEHLy9tNmGMJPhwGGTbdKET9vX37b95ecFcHzFrQQdBnSsBBWgipZVEK+VAKec/QqQBndmVucKUAWyuRegdjYJaGaO+yzE945mMbx5S8AuFSeAWVDkWuIgqaA+s6AmrXt3WoFmAFXgRfQ5SLIbDt4sSACybaUkMgWKNsBFEtHYBeCl1c2Amrbn7l8WQKvKuiwjnw/EnHrb6C3cXgAAAABJRU5ErkJggg==)',
//				'fontSize': 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAQCAYAAAAI0W+oAAAAtElEQVQ4jbWUXRGGIBBFjUAEIhDhi0IEIxjBCEYwghGM8EWwwfHlMoM74gM/d4bBZZk9DnthmjoICMAfCD3qlSBOEDS7UaCTp84hoK4CtuF/qx7kGtNwYBZg17yZfJ8eyUmX/c7yDrgEuapcB/xUYFW8KI5mX9s9ykzgFXvFR1XBAiQdyWHWH/AeoMi31l6g5KblZWBNUQsJX1bNrB5bQakPcyGfjnVvBaV74Qv5/LV43WN1AxG4aOeiSzd1AAAAAElFTkSuQmCC)',
			},
			'mail': "data:image\/png;base64,iVBORw0KGgoAAAANSUhEUgAAACUAAAAYCAYAAAEKfQTmAAAACXBIWXMAAAsTAAALEwEAmpwYAAAKT2lDQ1BQaG90b3Nob3AgSUNDIHByb2ZpbGUAAHjanVNnVFPpFj333vRCS4iAlEtvUhUIIFJCi4AUkSYqIQkQSoghodkVUcERRUUEG8igiAOOjoCMFVEsDIoK2AfkIaKOg6OIisr74Xuja9a89+bN\/rXXPues852zzwfACAyWSDNRNYAMqUIeEeCDx8TG4eQuQIEKJHAAEAizZCFz\/SMBAPh+PDwrIsAHvgABeNMLCADATZvAMByH\/w\/qQplcAYCEAcB0kThLCIAUAEB6jkKmAEBGAYCdmCZTAKAEAGDLY2LjAFAtAGAnf+bTAICd+Jl7AQBblCEVAaCRACATZYhEAGg7AKzPVopFAFgwABRmS8Q5ANgtADBJV2ZIALC3AMDOEAuyAAgMADBRiIUpAAR7AGDIIyN4AISZABRG8lc88SuuEOcqAAB4mbI8uSQ5RYFbCC1xB1dXLh4ozkkXKxQ2YQJhmkAuwnmZGTKBNA\/g88wAAKCRFRHgg\/P9eM4Ors7ONo62Dl8t6r8G\/yJiYuP+5c+rcEAAAOF0ftH+LC+zGoA7BoBt\/qIl7gRoXgugdfeLZrIPQLUAoOnaV\/Nw+H48PEWhkLnZ2eXk5NhKxEJbYcpXff5nwl\/AV\/1s+X48\/Pf14L7iJIEyXYFHBPjgwsz0TKUcz5IJhGLc5o9H\/LcL\/\/wd0yLESWK5WCoU41EScY5EmozzMqUiiUKSKcUl0v9k4t8s+wM+3zUAsGo+AXuRLahdYwP2SycQWHTA4vcAAPK7b8HUKAgDgGiD4c93\/+8\/\/UegJQCAZkmScQAAXkQkLlTKsz\/HCAAARKCBKrBBG\/TBGCzABhzBBdzBC\/xgNoRCJMTCQhBCCmSAHHJgKayCQiiGzbAdKmAv1EAdNMBRaIaTcA4uwlW4Dj1wD\/phCJ7BKLyBCQRByAgTYSHaiAFiilgjjggXmYX4IcFIBBKLJCDJiBRRIkuRNUgxUopUIFVIHfI9cgI5h1xGupE7yAAygvyGvEcxlIGyUT3UDLVDuag3GoRGogvQZHQxmo8WoJvQcrQaPYw2oefQq2gP2o8+Q8cwwOgYBzPEbDAuxsNCsTgsCZNjy7EirAyrxhqwVqwDu4n1Y8+xdwQSgUXACTYEd0IgYR5BSFhMWE7YSKggHCQ0EdoJNwkDhFHCJyKTqEu0JroR+cQYYjIxh1hILCPWEo8TLxB7iEPENyQSiUMyJ7mQAkmxpFTSEtJG0m5SI+ksqZs0SBojk8naZGuyBzmULCAryIXkneTD5DPkG+Qh8lsKnWJAcaT4U+IoUspqShnlEOU05QZlmDJBVaOaUt2ooVQRNY9aQq2htlKvUYeoEzR1mjnNgxZJS6WtopXTGmgXaPdpr+h0uhHdlR5Ol9BX0svpR+iX6AP0dwwNhhWDx4hnKBmbGAcYZxl3GK+YTKYZ04sZx1QwNzHrmOeZD5lvVVgqtip8FZHKCpVKlSaVGyovVKmqpqreqgtV81XLVI+pXlN9rkZVM1PjqQnUlqtVqp1Q61MbU2epO6iHqmeob1Q\/pH5Z\/YkGWcNMw09DpFGgsV\/jvMYgC2MZs3gsIWsNq4Z1gTXEJrHN2Xx2KruY\/R27iz2qqaE5QzNKM1ezUvOUZj8H45hx+Jx0TgnnKKeX836K3hTvKeIpG6Y0TLkxZVxrqpaXllirSKtRq0frvTau7aedpr1Fu1n7gQ5Bx0onXCdHZ4\/OBZ3nU9lT3acKpxZNPTr1ri6qa6UbobtEd79up+6Ynr5egJ5Mb6feeb3n+hx9L\/1U\/W36p\/VHDFgGswwkBtsMzhg8xTVxbzwdL8fb8VFDXcNAQ6VhlWGX4YSRudE8o9VGjUYPjGnGXOMk423GbcajJgYmISZLTepN7ppSTbmmKaY7TDtMx83MzaLN1pk1mz0x1zLnm+eb15vft2BaeFostqi2uGVJsuRaplnutrxuhVo5WaVYVVpds0atna0l1rutu6cRp7lOk06rntZnw7Dxtsm2qbcZsOXYBtuutm22fWFnYhdnt8Wuw+6TvZN9un2N\/T0HDYfZDqsdWh1+c7RyFDpWOt6azpzuP33F9JbpL2dYzxDP2DPjthPLKcRpnVOb00dnF2e5c4PziIuJS4LLLpc+Lpsbxt3IveRKdPVxXeF60vWdm7Obwu2o26\/uNu5p7ofcn8w0nymeWTNz0MPIQ+BR5dE\/C5+VMGvfrH5PQ0+BZ7XnIy9jL5FXrdewt6V3qvdh7xc+9j5yn+M+4zw33jLeWV\/MN8C3yLfLT8Nvnl+F30N\/I\/9k\/3r\/0QCngCUBZwOJgUGBWwL7+Hp8Ib+OPzrbZfay2e1BjKC5QRVBj4KtguXBrSFoyOyQrSH355jOkc5pDoVQfujW0Adh5mGLw34MJ4WHhVeGP45wiFga0TGXNXfR3ENz30T6RJZE3ptnMU85ry1KNSo+qi5qPNo3ujS6P8YuZlnM1VidWElsSxw5LiquNm5svt\/87fOH4p3iC+N7F5gvyF1weaHOwvSFpxapLhIsOpZATIhOOJTwQRAqqBaMJfITdyWOCnnCHcJnIi\/RNtGI2ENcKh5O8kgqTXqS7JG8NXkkxTOlLOW5hCepkLxMDUzdmzqeFpp2IG0yPTq9MYOSkZBxQqohTZO2Z+pn5mZ2y6xlhbL+xW6Lty8elQfJa7OQrAVZLQq2QqboVFoo1yoHsmdlV2a\/zYnKOZarnivN7cyzytuQN5zvn\/\/tEsIS4ZK2pYZLVy0dWOa9rGo5sjxxedsK4xUFK4ZWBqw8uIq2Km3VT6vtV5eufr0mek1rgV7ByoLBtQFr6wtVCuWFfevc1+1dT1gvWd+1YfqGnRs+FYmKrhTbF5cVf9go3HjlG4dvyr+Z3JS0qavEuWTPZtJm6ebeLZ5bDpaql+aXDm4N2dq0Dd9WtO319kXbL5fNKNu7g7ZDuaO\/PLi8ZafJzs07P1SkVPRU+lQ27tLdtWHX+G7R7ht7vPY07NXbW7z3\/T7JvttVAVVN1WbVZftJ+7P3P66Jqun4lvttXa1ObXHtxwPSA\/0HIw6217nU1R3SPVRSj9Yr60cOxx++\/p3vdy0NNg1VjZzG4iNwRHnk6fcJ3\/ceDTradox7rOEH0x92HWcdL2pCmvKaRptTmvtbYlu6T8w+0dbq3nr8R9sfD5w0PFl5SvNUyWna6YLTk2fyz4ydlZ19fi753GDborZ752PO32oPb++6EHTh0kX\/i+c7vDvOXPK4dPKy2+UTV7hXmq86X23qdOo8\/pPTT8e7nLuarrlca7nuer21e2b36RueN87d9L158Rb\/1tWeOT3dvfN6b\/fF9\/XfFt1+cif9zsu72Xcn7q28T7xf9EDtQdlD3YfVP1v+3Njv3H9qwHeg89HcR\/cGhYPP\/pH1jw9DBY+Zj8uGDYbrnjg+OTniP3L96fynQ89kzyaeF\/6i\/suuFxYvfvjV69fO0ZjRoZfyl5O\/bXyl\/erA6xmv28bCxh6+yXgzMV70VvvtwXfcdx3vo98PT+R8IH8o\/2j5sfVT0Kf7kxmTk\/8EA5jz\/GMzLdsAAAAgY0hSTQAAeiUAAICDAAD5\/wAAgOkAAHUwAADqYAAAOpgAABdvkl\/FRgAAButJREFUeNpifPr0KYO0tHQmAxJgZGBgMDx69OhRVlZWTpggCwMDA8OpU6duS0lJ6cEEAQAAAP\/\/YmRgYEDR+v\/\/\/+ksp06dmgYT+P79+ydGRsbzLPfv34erev369XMGBgYGAAAAAP\/\/YmBgYDAMDAxsv3Hjxn9s2MnJqYGBgcGCkYGBwXDXrl3nYLpOnjy5hYODg1NfX98ZJubm5mbJzMDAIHn+\/PlnGhoajh8\/fmTg4eFR4+DgUPr48SPDx48fGbq7u1uePXt2GwAAAP\/\/dI0xCsIwAEV\/VQISyNTSpkMRuhQPIHToATxAzyHewNMIHXubLAVRawYzfQhkKXXRpeCDzxv+8CIARwA7\/OcZGWNma+2gtS6Xr3PuHsdxsSIJKWVZ1\/WJJH5rmuYshChIYt227SWEgGmaHuM43rIs2\/d9f03TdFtV1SGEgKjrutl7\/5ZSJsscyZdSKt+QBIDk6yU5SXwAAAD\/\/5xSsUqFUAA999HkUPBwfIu4C28QkeAiRE4RtDSFm9APtAvOfURORrTcFqHJC8JtuYSDo4tIaos83nCRwKYeEUHxDpzlcM4ZDocAOAJwXNf1EyFkgT1gGMY5gJwAWJdlKQGgqipRFMVrGIbXfxWkaXpnmubKtu0TALAsyyUA1pxz+dNMKT3Nsuxe07Tll6aU2vi+f8Y557\/43QUAjOO4o5Typeu6DWPseZqmZdu275TSoGmaN6XUIWOMD8OwFULw77nd65MkkfM8f+R5nnqed\/XfrYQQD47jXBBCDoIgcAmAla7rl1EU3WJPxHF80\/f94yep5A+aRhxH8ef5Kx50kkxdup2DU6losMQ\/4KJEKUW4TWg4XKQ1oi3kpHCWDieJWBJKb3FxchLCUUodNGbRrZTeIG51c+ns\/X73u9qhWKQtJbZf+CwP3uPB+3oA3AVwiP+7DySZTD6WZfleJpN59C8J4\/H4fafT2RPy+fz9cDgcz2azJ5RS7IIsyy+CwWBIUZQDwjmHz+fb6\/V6zWg0ejwcDk8JIb6\/tXBd14nFYrXJZHIBAJxzEMdxYNs2AGAwGJwbhvE2kUiEAoHA\/p9CFovFZ9M0r0aj0cXGxxiDwBiDbds\/KRQKJcaYoGlac1u3bRutVuv1crn8WiwWj7d1xhiETaNtptPpp0ql8iwej2c3WiqVeqIoytPZbPZltVp9+y3o10blcrmey+WKlFJimuY7TdNeqaqq9fv9N5RSkk6nj+r1+sttj+M48NRqtctIJPIQAFRVPdF1vXmT2avV6vN2u30GAJZlDQTOOSil6Ha7541Go3nT6XVdPzMM45RS+qNRqVS6FEVRlCTpgBBye5dn5Jyv5vP5tSAIHq\/f738gSVJIFMU7rutiF9br9S2v10ssy\/r4XYwMDAysEhIS2StWrEhUVlbWYxgg8Pjx4+txcXHz7ty5M5mZgYFBv6urK0FQUFA4JCSk+969e1cNDQ21GRkZ2Un1Lan4+\/fvXydMmDCroKBgubu7u6apqanEhg0bbrIwMDAw\/P79m0FSUlJn06ZN3X\/\/\/v29cePG1U1NTcdmzZoVCCv2qQkuXbp0JDU1dVV2drZ+ampqamZmJjsDAwPD8+fPd8JbKchFAQMDA6unp2eUp6dn1Lt3754kJSXVsrCwMDU2NqYLCgpKkeuQz58\/v25vb5\/5\/Pnzbx0dHckHDx6El0V\/\/vyBFycojvr58yeGQdzc3DL9\/f3N0FbNjrKysraysjIrT0\/PMCYmJhZCDvn\/\/\/+\/AwcObKyurp7d3t6eXldXVwWr8bHZ9\/v3bwZcIYUV6OjoOLu5uV369+8fS1dX14QLFy68bG1tTZSWltZCV\/vq1au7dXV1s5WUlATMzc3VnZycrIyNjd1+\/vyJtwmCElKw4g4XOHbs2MYzZ87czM7OLmRmZma1tbWFlejnQ0NDC52dnZXCw8OjN2\/evGb9+vVXW1tboyZMmAAv6czMzHynTJkyUUVFRdrFxSWCaEd9\/\/6dAYuPbzY0NMzq6OgoNjQ09IdpggExMTHDWbNmGf79+\/f35cuXD3h5ecX7+vqyQ9vGyEpZ4uPjiz9\/\/vw8NTW1tKqqKlFCQkILl6OYkNMUDH\/9+vV7c3Nz\/ZMnTx719\/f3srOzS+Erjv\/8+cOqpqbm+ufPH3Z86tjY2CS7u7u737x586a+vr728+fPX5DlMdMUNOEdOnRoyYsXL97m5uXVMjIysvzAkiApBbJycnaFRUU2mzZtmsXBwcHu4uqayMDAwPAL3VGPHj68NGPGjMVlZWVl5mZmor9o4Bg0wOTq6prx8+fPD7U1NWWJiYnhv6HRxzhx4kSG\/Px8GQYGBnYGBgZtBgYG6QGoZV4xMDBcZWBg+Pn\/\/\/\/7gAEAb05N4qKYeo4AAAAASUVORK5CYII=",
			'compose': "data:image\/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAaCAYAAAHeTXxYAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw\/eHBhY2tldCBiZWdpbj0i77u\/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMC1jMDYxIDY0LjE0MDk0OSwgMjAxMC8xMi8wNy0xMDo1NzowMSAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNS4xIFdpbmRvd3MiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6MDA5QkJFRjAyMUM4MTFFM0FFNDdDRTZFMkNGQ0U4QjciIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6MDA5QkJFRjEyMUM4MTFFM0FFNDdDRTZFMkNGQ0U4QjciPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDowMDlCQkVFRTIxQzgxMUUzQUU0N0NFNkUyQ0ZDRThCNyIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDowMDlCQkVFRjIxQzgxMUUzQUU0N0NFNkUyQ0ZDRThCNyIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI\/PiCpd68AAAM7SURBVHjaYjx16hQDCJiamoJpJgYkcPr06aUgAU4ksUCQwHcgXgSUfQvUxgUQQAwgM4A47f\/\/\/3D9XRiGwTh3QARAADFC7f0AxAIw+4EGrgbSoSCVFVCJNCD+BpRIA0kA6WMwnauBOBTZ5SAAEEAwSRAwBmIDoORcEIcFKgjyyVkoBtmnC7JrO9RHcADUdRlmlBYQ2yBJzAIZ5QfEm4D4GnrQHWdAA0A7boMkXkP5\/4H4IVDQDKhLFSCAkJ0LAiuAmB+Io4H4HVQsCoiXArEwUMM7ZD+CBFPQXY4eIECbLgH5eiAnWAJxFhYNH7AYoAfU+AfkU10kT4kCsRyUzQwKYaAimIazUPHXMOeBPMqIxSYBNOeBwvYXLHoYoTYuAmJDqJgAmuJFQAOUQHyAAEIPPRhIhjrvLJKz4IAFiS0ExG+hwT0XJga0BZQePgI1R6AnXZDTZkKduQzJoHdAxZ5AOhGo+QO6pqWwhIoNADWCokMSlNNgmkCe18OidgsWjUIwTVEMxIMIUEiCAgI5+NKQ2KBIToNG7jKgTV+A+CNMkyKSQuTg\/YjE\/4UcOCzQVI1TE1qKAGWuxSA\/OSBnPQJgIyhAYH66B8RKaAp80HIlqPwQQ44nJahGrDYCNZwHUk1AW16jJyOQRjNoUvoCzeqgrLEYqNgQ2RCAAMOVYJFLrHwg9oZG7AsgfgqVkwZiCWixsBWIJ2JL3NgSOQyAyrGNUBfmAnEcPpfAYgQU51Cv8wCxP1D8Gi4fgUqHY0B8AV96x1dWoUWOARBbwcIbFkmgcH4FymlEWPIBPc9gsTwUatYrUJEMswhUSRwA4iAgPsJAJQC07AjUzANAyzhBFsVCI3k9A5UB0LL1ULNjWaCp6R0WdZlAPA2HGd7QQpwBVspDgTzQ8EdoakFmC4ESgw006ASgKY2BiDg6Asud2BIDUqLggap3YIJqWgNtBlAbgMxcA4ovWD6KgNbNoHxgha3KRQILYE0cPD7hhGaVm7BKBjnDRkArmudAvBuaUbFZWEDAAlA14grEtqDWDKEiSAhas4UA8Q6oL3ZAy2dkACrHPYA4AUqDoiAd1jIhpaxDL\/eMoZU2CPzFVXljAwBsiybgUCzWVAAAAABJRU5ErkJggg==",
			'sendMail': "data:image\/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAaCAYAAAHeTXxYAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw\/eHBhY2tldCBiZWdpbj0i77u\/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMC1jMDYxIDY0LjE0MDk0OSwgMjAxMC8xMi8wNy0xMDo1NzowMSAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNS4xIFdpbmRvd3MiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6MkJBMDU2QjAyMUM4MTFFMzhENTM5NzJBMTI2OEM2QjYiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6MkJBMDU2QjEyMUM4MTFFMzhENTM5NzJBMTI2OEM2QjYiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDoyQkEwNTZBRTIxQzgxMUUzOEQ1Mzk3MkExMjY4QzZCNiIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDoyQkEwNTZBRjIxQzgxMUUzOEQ1Mzk3MkExMjY4QzZCNiIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI\/PspK+6wAAANsSURBVHjaYjx16hQDCJiamoJpJgYkcPr06aUgAU4ksUCQwHcgXgSUfQvUxgUQQAwgM4A47f\/\/\/3D9lsiGaSFzmEEEQAAxQu39AMQCMPuBBq4G0qEsQH4FTALqjv9ACUYgfQymczUQhyK7HAQAAggmCQLGQGwAlJwL4rBABUE+OQvFIGN1Qa7aDvWRGUwrUNdlkIQnlH8KOVBAEn5IfDlkieNIEo+gdtwGSbyGCv4H4odAQTOgHaoAAYTsXBBYAcT8QBwNxO+gYlFAvBSIhYEa3iH7ESSYAnU5CkAOEKBNl4B8PSZolGRh0cADchKaAXpAjX9AmnSB+CMDJvgCxOuBimLRxF\/DnAfyKCOSBMgfy7A4zwZI\/YJFDyPUxkVAbAjTgKZ4EdAAJRAfIIDQQw8GkqGJ7CxQ4Vl0SRYkthAQv4UG91yYGNAWUHr4CNQcgRyzDFCnzYQ6E9lp74CKQWklEaj5A7qmpbCEig0ANYKiQxKU02CaQJ7XQ1P3HIjZsGgUgmmKwmK4JBBvhDobGUSAQpIJPV0jAZBfvIGKKpBsAyUCG1DoKTLgBnXg8gAVvGOCpmp0IAHE54GYCy2SQZlrMUiTA8hKNE1O0JSBDjaCAoQF6qd7QKyEJLkMXTWopAFSYsjxpATVaIPNY0ANIKc2AW15jZ6MlKBFx1totgApMAZqWAxUjOJUgADDlWCRS6x8UNBDI\/YFED+FyklDAwxUBGwF4onYEje2RM6AVAZvhLowF4jj8LkElkdBCQXqdVAp4Q8Uv4bLR6JAfAyIL+BL7\/jKKrTIMQBiK1h4wyIJFM6vQDkNhyWgfA8qkkKItDwUatYrUJEMswhUSRwA4iAgPoJD719QIoUmt0tAfBIaP\/gsOwI18wDQMk4mqEtBkbyeCMc+gpYKtkDcDsSfgYZ447FsPdTsWCZoanrHQBr4BQ2aSlDCAVrWjkctyGwhFmhwtUBTyxciLOGElnc20NTFgksh0AE80ERRwAS1aA20GYAP6EIrt0XQJC+Jp9iDAZCZa0DxBXNNBLRuBuUDK2xVLhBcBmJ5YsIVFPnQrHITVskgezsC6mpQkb8b6urvpEQc1AKQj11BCQbUmiFUBAlBazZQvtkBxAugNHrVDyrHPYA4AUqDoiAd1jIhpaxDL\/eMYS1DaN46i698QwYA7ichDuh2+qMAAAAASUVORK5CYII=",
			'expand': "data:image\/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAHCAYAAAG3oLd4AAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw\/eHBhY2tldCBiZWdpbj0i77u\/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMC1jMDYxIDY0LjE0MDk0OSwgMjAxMC8xMi8wNy0xMDo1NzowMSAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNS4xIFdpbmRvd3MiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6OENBNTNFOTYyMUM5MTFFMzgxQ0U4NURBODIyODZFQjEiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6OENBNTNFOTcyMUM5MTFFMzgxQ0U4NURBODIyODZFQjEiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDo4Q0E1M0U5NDIxQzkxMUUzODFDRTg1REE4MjI4NkVCMSIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDo4Q0E1M0U5NTIxQzkxMUUzODFDRTg1REE4MjI4NkVCMSIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI\/PkXCZdMAAAB7SURBVHjaYrhy5UoUQAAxAIk6gABiBBJODAwMpQABBOIxMAFZiwACCCTEA2R8BmIrFiDxBYjFgPg1QACBZHSBjMsgdQlA\/BDEyARiNpA6LiBmAAgwkJocIN0IxBFAnAzE9iBZkJHdQCwNxBNBNEiwA4jNgHg7EG8CYmcAZrIfR0hmuRcAAAAASUVORK5CYII=",
			'collapse': "data:image\/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAHCAYAAAG3oLd4AAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw\/eHBhY2tldCBiZWdpbj0i77u\/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMC1jMDYxIDY0LjE0MDk0OSwgMjAxMC8xMi8wNy0xMDo1NzowMSAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNS4xIFdpbmRvd3MiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6QjJFQkEwM0YyMUM5MTFFMzgwM0JDNkQ5QzlCNjQ3MUMiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6QjJFQkEwNDAyMUM5MTFFMzgwM0JDNkQ5QzlCNjQ3MUMiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDpCMkVCQTAzRDIxQzkxMUUzODAzQkM2RDlDOUI2NDcxQyIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDpCMkVCQTAzRTIxQzkxMUUzODAzQkM2RDlDOUI2NDcxQyIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI\/Pi65wUkAAAB0SURBVHjaYrhy5QoDQAAxgAiAAGIEEjwMDAxaAAEE4okyAVmvAAIIJOQEZKQBMT9IRAKII4D4FEAAMYK1AQELEH8D4o8g6elA\/AvEWADE8gABBlNjBsTbgXgTEKeD1FcwQEAxEN8E4sMgLV+gEk+BuAiIpQHP\/SBDZEL2QgAAAABJRU5ErkJggg==",
			'drop': "data:image\/png;base64,iVBORw0KGgoAAAANSUhEUgAAABEAAAAKCAYAAAEle4U0AAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw\/eHBhY2tldCBiZWdpbj0i77u\/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMC1jMDYxIDY0LjE0MDk0OSwgMjAxMC8xMi8wNy0xMDo1NzowMSAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNS4xIFdpbmRvd3MiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6QjM5REMxOTYyMUM3MTFFM0JBODRGNUVCNzE5NTlBMUUiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6QjM5REMxOTcyMUM3MTFFM0JBODRGNUVCNzE5NTlBMUUiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDpCMzlEQzE5NDIxQzcxMUUzQkE4NEY1RUI3MTk1OUExRSIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDpCMzlEQzE5NTIxQzcxMUUzQkE4NEY1RUI3MTk1OUExRSIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI\/Phn5Ps0AAADuSURBVHjaYjh16pTx\/\/\/\/GUCYhQEITp8+DaIYAAKIESQCAkxQUX6AAGKAqQXS3kAMotsBAgiuDAbgAkAt34DURxYkSS4QARBAjCBzTE1Nz8JEgSpVgNQdJIWWTAyYAKSgHYhB5q8D4uMAAQRywTuY67FhFnQjgFaJAqnXUC4bNmteAXEUyA1A\/JMFiwKQ2B8omxebgr8gX8I4AAEGDjZCDiWEsdmC7jFvIDUNiP2B+AKSlDQ0uPYxMRAGR4D4GhCfh4bzalAgAPETIOYE4rnEGPIRiD2hYRAKxCCXNUH5eqCIJOgdYPJA5q6BYhQAAIt8mGSW9QmrAAAAAElFTkSuQmCC",
			'expandDocument': "data:image\/png;base64,iVBORw0KGgoAAAANSUhEUgAAABcAAAATCAYAAAEMvKYgAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw\/eHBhY2tldCBiZWdpbj0i77u\/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMC1jMDYxIDY0LjE0MDk0OSwgMjAxMC8xMi8wNy0xMDo1NzowMSAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNS4xIFdpbmRvd3MiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6ODZDRjVGNDEyOTI5MTFFM0JFRjBCRjEyQTVDODM4OEMiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6ODZDRjVGNDIyOTI5MTFFM0JFRjBCRjEyQTVDODM4OEMiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDo4NkNGNUYzRjI5MjkxMUUzQkVGMEJGMTJBNUM4Mzg4QyIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDo4NkNGNUY0MDI5MjkxMUUzQkVGMEJGMTJBNUM4Mzg4QyIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI\/PrFxFU0AAAEZSURBVHjaYly3bh0DFPxnAhI8IAYQM4I4X0AMkBRAADFClYFkGJhgDJAEC0wJCAAEECOSaSiACUpLo0sABBCyjv\/YdMAVwuxhQVcJAyguwWUUik6AAMLl3P84TPqPbNIZNMfh9XcvEBszEAFgGorRTP2PSwMLHsOwagIIIGyeJtl0gqFDtEdVgLiCmGCcD8S3gbgd6t7\/uNwNUpwOZVcipRycaeMXVPIssW4Ggd2Ego6k0GAhJQYBAgxnLiM2VslxCQMJKQGnY7CFCRsQa+HK7OSkKBAIB+LPQPwTiP0YqABAhitCc\/0KaDHJgCU1\/ieUOnEZfh+ITaDe9gHid1hSLyOh1ExMhG4FYmEGKgEmEmL\/P62TIkkWAABseD4pIBbN+AAAAABJRU5ErkJggg==",
			'contractDocument': "data:image\/png;base64,iVBORw0KGgoAAAANSUhEUgAAABcAAAATCAYAAAEMvKYgAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw\/eHBhY2tldCBiZWdpbj0i77u\/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMC1jMDYxIDY0LjE0MDk0OSwgMjAxMC8xMi8wNy0xMDo1NzowMSAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNS4xIFdpbmRvd3MiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6NkNEQ0Q3NUUyOTI5MTFFM0FGNjZFQ0JERDMxN0EzMkQiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6NkNEQ0Q3NUYyOTI5MTFFM0FGNjZFQ0JERDMxN0EzMkQiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDo2Q0RDRDc1QzI5MjkxMUUzQUY2NkVDQkREMzE3QTMyRCIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDo2Q0RDRDc1RDI5MjkxMUUzQUY2NkVDQkREMzE3QTMyRCIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI\/PhXno4sAAAEjSURBVHjaYvz\/\/z\/D+vXrGYDgPxMDBPwHESxQDiOIAAggxnXr1sFlYMrAEkzIygACiBHJNBTAxIADAAQQso7\/+HQwwuxAcSSU5sRwMBBIA\/F3ZAmYapgCBoAAAlsOAmhORlGELI7LGzDFZ4j2NxQYA3EvsgALDoX\/kYOAGA0YAQoDAAGEzdP\/cZnAQsDDRIUOVsCEx9QKIFbBp\/g\/Em4H4ttAPJ9QygHhSqhYOjHBdxbdo0x4wng3qVHPQGy0YwCAAIPHIAxgy3H4YpUclzCQkBJwOoaJBEORDdYCYjZyUhQxwA+IfwLxZyAOJ8fw\/3hwO1QNDxCvAOKTQKxIiuGMeDAoNb8DYh8o3xyI71MrWDqAWBiIt1IjzP+TkxxJTYokWQAA4GhPRy5oqbUAAAAASUVORK5CYII="
		}
	}
});

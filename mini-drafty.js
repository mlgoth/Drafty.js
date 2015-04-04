var Drafty=function(a,c,b){this.backend_url="backdraft.ajax.php";this.draft_ident=a;this.html_id=c;this.last_restored="";this.msg_id=b?b:null;this.uid="0";this.umsgs={no_text:"No text have been input - nothing to save",no_chg1:"Draft not saved - there are no changes",no_chg2:"Draft not saved - no changes since last restore",ajax_err:"Drafty AJAX problem"};$("#drafty-box").css("visibility","visible");if(this.html_id.substr(0,1)=="."){this.inputs_list=document.getElementsByClassName(this.html_id.substr(1))}else{this.inputs_list=[document.getElementById(this.html_id)]}this.initial_data=this.fetch_inputs();this.restore_js=this.constructor.name+".restore_draft(%d);";this.setup_devmode(false);this.dmsg("Drafty object created")};Drafty.prototype.setup_devmode=function(a){this.DEV_MODE=a;if(this.DEV_MODE){if(document.getElementById("drafty-logpane")){this.log_pane="#drafty-logpane"}if(this.log_pane){$(this.log_pane).css("display","block");$(this.log_pane).css("visibility","visible")}}else{if(this.log_pane){$(this.log_pane).html("Devmode disabled")}this.log_pane=null}};Drafty.prototype.ajax_url=function(b){var a=this.backend_url;if(this.DEV_MODE&&b){a+="?"+b}return a};Drafty.prototype.dmsg=function(a){if(!this.DEV_MODE||!this.log_pane){return}var b=this.log_pane;a=new Date().toTimeString().substr(0,8)+" "+a+" ("+this.html_id+")";$(b).html(a+"<br>"+$(b).html())};Drafty.prototype.errormsg=function(a){this.dmsg(a);if(!this.msg_id){return}this.usermsg(a,"drafty-error")};Drafty.prototype.fetch_inputs=function(){var a={};for(var b=0;b<this.inputs_list.length;b++){if(this.inputs_list[b].id==""){console.error("Drafty.js: HTML inputs must have id=  -- id-less input not saved with draft")}else{a[this.inputs_list[b].id]=this.inputs_list[b].value}}if(a.length==0){console.error("Drafty.js: No inputs to save drafts for!");return""}return JSON.stringify(a)};Drafty.prototype.set_userid=function(a){this.uid=a};Drafty.prototype.usermsg=function(b,a){if(b){this.dmsg("uMsg: "+b)}if(!this.msg_id){return}if(b){if(!a){a="drafty-msg"}$("#"+this.msg_id).html('<span class="'+a+'">&nbsp;'+b+"&nbsp;</span>")}else{$("#"+this.msg_id).html("&nbsp;")}};Drafty.prototype.save_draft=function(b){var d=this.fetch_inputs();if(d==this.initial_data){if(!b){this.usermsg(this.umsgs.no_text)}return}if(this.last_saved==d){if(!b){this.usermsg(this.umsgs.no_chg1)}return}if((this.last_restored!="")&&(d==this.last_restored)){if(!b){this.usermsg(this.umsgs.no_chg2)}return}this.usermsg();this.dmsg("Saving draft");if(this.saving_cb){this.saving_cb(1)}if(this.saving_cb){this.saving_cb(2)}var a={op:"save",uid:this.uid,data:d,ident:this.draft_ident};var c=this;$.post(this.ajax_url("save"),a,function(f,e){if(c.saving_cb){c.saving_cb(3)}if(e!="success"){c.errormsg("save_draft() ajax failure "+e);return}if(!f){c.errormsg("JSON unparseable");return}if(f.msg){this.usermsg(this.umsgs.ajax_err+": "+f.msg)}else{if(f.glhtml){$("#drafty-genlist").html(f.glhtml)}else{c.refresh_genlist()}c.last_saved=d;c.dmsg("Draft #"+f.gen+" saved")}if(c.saving_cb){c.saving_cb(0)}},"json")};Drafty.prototype.restore_draft=function(b){var a={op:"load",uid:this.uid,genno:b,ident:this.draft_ident};var c=this;$.post(this.ajax_url("restore"),a,function(g,e){var d=JSON.parse(g.data);for(var f in d){if(d.hasOwnProperty(f)){$("#"+f).val(d[f])}}c.last_restored=g.data;if(g.msg){c.dmsg("ajax:"+g.msg)}c.dmsg("Draft #"+b+" restored ")},"json")};Drafty.prototype.refresh_genlist=function(c){this.dmsg("Pulling new genlist");var b=this;if(0){$.post(this.ajax_url("genlist"),{op:"genlist",ident:this.draft_ident},function(e,d){if(d!="success"){b.errormsg("AJAX failed "+d);return}if(e.msg){b.dmsg("ajax:"+e.msg)}$("#drafty-genlist").html(e.html);b.dmsg("Genlist refreshed, have "+e.cnt+" draft generations");if(c&&e.cnt>0){c(e.max)}},"json")}else{var a={op:"genlist",ident:this.draft_ident,uid:this.uid,cb:this.restore_js}}$.post(this.ajax_url("genlist"),a,function(f,d){if(d!="success"){b.errormsg("AJAX-1 failed "+d);return}if(!f||f===""){b.errormsg("AJAX-2 failed "+d);return}var h;try{h=jQuery.parseJSON(f)}catch(g){b.errormsg("AJAX failed(3) - error parsing JSON");return}if(h.msg){b.dmsg("ajax:"+h.msg)}$("#drafty-genlist").html(h.html);b.dmsg("Genlist refreshed, have "+h.cnt+" draft generations");if(c&&h.cnt>0){c(h.max)}},"text")};Drafty.prototype.kill_all=function(){this.dmsg("Wipe all draft gens");args={op:"wipe",uid:this.uid,ident:this.draft_ident};var a=this;$.post(this.ajax_url("killall"),args,function(c,b){if(b!="success"){console.error("ajax failed "+b);return}a.last_saved=a.last_restored=null;if("msg" in c){a.errormsg("AJAX error:"+c.msg)}else{a.dmsg("All "+c.cnt+" draft generations removed")}a.refresh_genlist()},"json")};Drafty.prototype.autosave_init=function(){if(this.timer){window.clearInterval(this.timer);this.timer=null;this.dmsg("Autosave timer stopped")}if(this.autosave_secs>0){this.dmsg("Autosaving every "+this.autosave_secs+" seconds");var a=this;this.timer=window.setInterval(function(){a.save_draft(true)},this.autosave_secs*1000)}else{this.dmsg("Autosaving disabled")}};Drafty.prototype.autosave_setup=function(a){this.autosave_secs=a;this.autosave_init()};Drafty.prototype.toggle_devmode=function(){this.setup_devmode(!this.DEV_MODE);this.usermsg("Devmode is now "+(this.DEV_MODE?"enabled":"disabled"))};
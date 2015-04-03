// ----------------------------------------------------------------------------
//
// drafty.js - https://github.com/mlgoth/Drafty.js/wiki
// Draft and autosave objects for HTML input fields.
// jQuery required.
// Copyright (C) Stig H. Jacobsen 2013-2015
//
//
// Before-prod TODO
// ----------------
//  - All HTML id's should be named "drafty-XXX"
//  - "Saved" and "Not saved" indicators in green and red
//     - Like Google Docs, "All changes saved to drive"
//  - Implement testForChange() from old drafts.js
//  - Remove all old drafts.js code from bottom of this file
//
//
// GC release functionality missing/incomplete
// -------------------------------------------
//  - Nicer genlist, not so many numbers, weekdays, not so wide, '5m', '3d'
//  - No buttons shown for ordinary staff in genlist?
//  - Don't use .getscript(), but jsmisc::src to utilize GC minification setup
//
//
// Github/Internet release TODO
// ----------------------------
//  - Missing:
//     - Better multilanguage support, da-draft.js for danske tekster?
//     - Drafty demo-site on derkins, also release downloads here (github = dev downloads)
//     - Properly documented on the github wiki
//  - Errorhandling:
//     - Ajax script is missing
//     - Error in SQL in backend
//     - Save does not succeed (msg set in json)
//     - Restore does not succeed (msg set in json)
//     - Errors should be yellow when shown to user
//  - Test:
//     - Verify that generated HTML and CSS is HTML5 compat, w3c
//     - Use Opera to verify CSS is valid
//     - Browser tests: FF, Chrome, Safari-Win, IE-Win, Chrome-Android, Browser (Android)
//     - Integrate with MQT - does it play nicely?
//     - Support for multiple Drafty objects/input fields on a single page??
//
//
// Future functionality TODO
// -------------------------
//  - Optionally use localStorage[] to save drafts instead of a backend script on the webserver
//     - DraftyWBE inherits Drafty, uses webserver BE script as draft storage
//     - DraftyH5 or DraftyLS or DraftyH5LS (HTML5/localStorage cryptically to make 
//       ppl wondering :-) also inherits Drafty
//  - Warn user when leaving page (and there is unsaved text)
//  - Autosave timer stop on blur, start on focus
//       this.input_area = document.getElementById(this.html_id);
//       this.input_area.onblur = myfunc;
//  - Smart unobtrusive idle autosaving
//     - Idle autosave functionality should be separate from this and go on top of
//       this, with the autosave-code using methods here to do the actual saving?
//        - (user)idledetector.js - class for invoking user functions on user idling in browser
//  - Support for saving drafts with multiple input fields (HTML form with 
//     - Support multiple input html fields per object, passing either a string or an array:
//         if (value instanceof Array) { alert('value is Array!'); }
//    header and body text)
//  - Support for saving non-text drafts, <select>, radio buttons, checkboxes, etc.
//  - Support for UTF-8
//  - Better support for other/different user languages
//  - Automatic cleanup of old drafts
//     - Object/table retain_days arg, 90 for gc comments, 5*365 for reviews
//     - auto cleanout drafts older than this number of days (save_time)
//  - Mail user when draft hasn't been updated for a week! "Come back, finish
//    your new content and publish it..."
//  - "Attic" drafts - access to the drafts that were deleted on last save(s)
//     - Greyed out in the genlist to show oldness but can still be restored
//     - Attic-feature enabled on a per-object basis
//
/*
In english please:

(attic feature)

to situationer der ikke håndteres, fordi alle drafts slettes ved gem:
 - stor del markeret tekst, rammer en tast (markeret tekst forsvinder)
   og får ramt Gem-knappen bagefter - kladderne blev slettet, da der blev trykket Gem
 - Der sker noget andet med teksten (katten sover på keyboardet) og bruger trykker
   Gem uden at checke teksten efter først.
*/
//
//
//
// ----------------------------------------------------------------------------


// ----------------------------------------------------------------------------
/* Drafty constructor

Required arguments:
   draft_ident : uniquely identifies this particular draft - used as key in SQL db
   html_id     : HTML id or class of input field(s) whose content to save as drafts

Optional arguments:
   msg_id   : html id of div for status messages

*/

var Drafty = function(draft_ident, html_id, msg_id) {

   this.backend_url = 'backdraft.ajax.php';

   this.draft_ident = draft_ident;
   this.html_id = html_id;
   this.last_restored = '';
   this.msg_id = msg_id ? msg_id : null;

   // Default messages shown to end user - these can be overriden in usercode to talk a different language
   this.umsgs = { 
                  'no_text':  'No text have been input - nothing to save',
                  'no_chg1':  'Draft not saved - there are no changes',
                  'no_chg2':  'Draft not saved - no changes since last restore',
                  'ajax_err': 'Drafty AJAX problem'
                };

   //todo what if the <div> isn't in the html?
   $('#drafty-box').css('visibility', 'visible');      //unhide if created hidden initially

   if (this.html_id.substr(0,1) == '.')      // .drafty-inputs ?
      this.inputs_list = document.getElementsByClassName(this.html_id.substr(1));
   else
      this.inputs_list = [ document.getElementById(this.html_id) ];

   this.initial_data = this.fetch_inputs();

   this.setup_devmode(false);
   this.dmsg('Drafty object created');

} // Drafty constructor


// ----------------------------------------------------------------------------
// Private methods

Drafty.prototype.setup_devmode = function(what) {
   this.DEV_MODE = what;
   if (this.DEV_MODE) {
      if (document.getElementById('drafty-logpane'))
         this.log_pane = '#drafty-logpane';
      if (this.log_pane) {
         $(this.log_pane).css('display', 'block');      //unhide if created hidden initially
         $(this.log_pane).css('visibility', 'visible');      //unhide if created hidden initially
      }
   } else {
      if (this.log_pane)
         $(this.log_pane).html('Devmode disabled');
      this.log_pane = null;
   }

}

Drafty.prototype.ajax_url = function(what) {
   var rval = this.backend_url;
   if (this.DEV_MODE && what)
      rval += '?' + what;           // Informative URLs makes debugging easier
   return rval;
}


// Print message to log pane, if setup to do so
Drafty.prototype.dmsg = function(msg) {
   
   if ( ! this.DEV_MODE || ! this.log_pane )
      return;

   var id = this.log_pane;
   msg = new Date().toTimeString().substr(0, 8) + ' ' + msg + ' (' + this.html_id+ ')';
   $(id).html( msg + '<br>' + $(id).html() );

} // dmsg()


// Notify user of error condition
Drafty.prototype.errormsg = function(msg) {

   this.dmsg(msg);       //always log

   if ( ! this.msg_id )    //output user messages at all?
      return;

   this.usermsg(msg, "drafty-error"); //NLS

} // Drafty.errormsg()


// ----------------------------------------------------------------------------
// Public methods

// Show message to user, maybe highlighted
Drafty.prototype.usermsg = function(msg, css_class) {

   if (msg)
      this.dmsg('uMsg: '+msg);       //always log

   if ( ! this.msg_id )    //output user messages at all?
      return;

   if (msg) {
      if (!css_class)
         css_class = 'drafty-msg';
      $('#'+this.msg_id).html('<span class="'+css_class+'">&nbsp;'+msg+'&nbsp;</span>');
   } else
      $('#'+this.msg_id).html('&nbsp;');     //to avoid the <div> "collapsing" due to being empty

} // Drafty.usermsg()


// ----------------------------------------------------------------------------

// Retrieve & convert html input data to json
Drafty.prototype.fetch_inputs = function () {

   var inputs = {};
   for (var i = 0; i < this.inputs_list.length; i++) {
      if (this.inputs_list[i].id == "")
         console.error('Drafty.js: HTML inputs must have id=  -- id-less input not saved with draft');
      else
         inputs[ this.inputs_list[i].id ] = this.inputs_list[i].value;
   }

   if (inputs.length == 0) {
      console.error('Drafty.js: No inputs to save drafts for!');
      return '';
   }

   return JSON.stringify(inputs);

} // fetch_inputs()


// ----------------------------------------------------------------------------
// 
// save_draft() method
// 
// Save draft to database, if it has changed
// If 'autosaving' is true, no usermsg() calls are made (unless a real error occurs).

Drafty.prototype.save_draft = function (autosaving) {

   // --- Do some sanity checks before saving ---
      
   var inputs_json = this.fetch_inputs();

   // has data changed since drafty object was created?
   if (inputs_json == this.initial_data) {    
      if (!autosaving)
         this.usermsg(this.umsgs.no_text);
      return;
   }

   // has text changed since last save?
   if (this.last_saved == inputs_json) {    
      if (!autosaving)
         this.usermsg(this.umsgs.no_chg1);
      return;
   }

   // has text changed since last restore?
   if ((this.last_restored != '') && (inputs_json == this.last_restored)) {
      if (!autosaving)
         this.usermsg(this.umsgs.no_chg2);
      return;
   }

   // --- Ok to save draft, go ahead ---

   this.usermsg();      //clear any old message
   this.dmsg('Saving draft');

   if (this.saving_cb)
      this.saving_cb(1);      //draft save commences

   if (this.saving_cb)
      this.saving_cb(2);      //Sending POST now

   var args = { 'op':   'save',
                'data':  inputs_json,
                'ident': this.draft_ident };

   var that = this;     // 'this' is not available in the inline function, so save it in a var that is

   $.post(this.ajax_url('save'), args, function(jobj,status) {

      if (that.saving_cb)
         that.saving_cb(3);   // Got response to POST

      if (status != 'success') {
         that.errormsg('save_draft() ajax failure ' + status);
         return;
      }

      if ( ! jobj ) {    //todo errorcheck does not work
         that.errormsg('JSON unparseable');
         return;
      }

      //show error message, if any
      if (jobj.msg)
         this.usermsg(this.umsgs.ajax_err + ': '+jobj.msg);
      else {
         if (jobj.glhtml)     // if ajax 'save' returned fresh genlist html, use it
            $('#drafty-genlist').html(jobj.glhtml);
         else
            that.refresh_genlist();    // Another AJAX call to refresh genlist pane
         that.last_saved = inputs_json;
         that.dmsg('Draft #'+jobj.gen+' saved');
      }

      if (that.saving_cb)
         that.saving_cb(0);      //save finished

   }, 'json');

} // save_draft()


// ----------------------------------------------------------------------------
// 
// restore_draft() method
// 
// Restores the specified draft generation to the html input field
// Returns null for success, else an error message
// Only tested with <textarea>

// TODO Save draft before restoring? (avoid loosing changes in input field, if any)
// todo error checking, also for invalid json
// todo restore only input fields known to the current object (don't reestore fields that developer dropped since the draft save)
Drafty.prototype.restore_draft = function (genno) {

   var args = { 'op':   'load',
                'genno':  genno,
                'ident':  this.draft_ident };
   var that = this;

   $.post(this.ajax_url('restore'), args, function(jobj,status) {
      //console.log('restoring '+genno+' => '+ jobj.data);

      var inputs = JSON.parse(jobj.data);
      for (var key in inputs) {
         if (inputs.hasOwnProperty(key)) {
            // console.log(key + " -> " + inputs[key]);
            $('#' + key).val(inputs[key]);
         }
      }

      that.last_restored = jobj.data;

      if (jobj.msg)
         that.dmsg('ajax:'+jobj.msg);    //msg from ajax script

      that.dmsg('Draft #'+genno+' restored ');

   }, 'json');

}


// ----------------------------------------------------------------------------
// 
// Genlist methods
// 

/*
Drafty.prototype.update_genlist = function (html) {
   $('#drafty-genlist').html(html);
}
*/


// Install/refresh new genlist HTML in div
// Optional callback function is passed latest genno as argument if any drafts exists
Drafty.prototype.refresh_genlist = function (callback) {

   this.dmsg('Pulling new genlist');

   var that = this;  // 'this' is not available in the post cb function

if (0)
   $.post(this.ajax_url('genlist'), {'op':'genlist', 'ident':this.draft_ident} , function(jobj,status) {

      if (status != 'success') {
         that.errormsg('AJAX failed ' + status);
         return;
      }

      if (jobj.msg)
         that.dmsg('ajax:'+jobj.msg);    //msg from ajax script

      $('#drafty-genlist').html(jobj.html);
      that.dmsg('Genlist refreshed, have '+jobj.cnt+' draft generations');

      if (callback && jobj.cnt > 0)
         callback(jobj.max);

   }, 'json');

else

   // This variant catches garbled JSON (error 3)
   $.post(this.ajax_url('genlist'), {'op':'genlist', 'ident':this.draft_ident} , function(data,status) {
      if (status != 'success') {
         that.errormsg('AJAX-1 failed ' + status);
         return;
      }
      if( !data || data === ""){
         that.errormsg('AJAX-2 failed ' + status);
         return;
      }
      var jobj;
      try {
         jobj = jQuery.parseJSON(data);
      } catch (e) {
         that.errormsg('AJAX failed(3) - error parsing JSON');
         return;
      }
      
      // json is ready for use in jobj

      if (jobj.msg)
         that.dmsg('ajax:'+jobj.msg);    //msg from ajax script

      $('#drafty-genlist').html(jobj.html);
      that.dmsg('Genlist refreshed, have '+jobj.cnt+' draft generations');

      if (callback && jobj.cnt > 0)
         callback(jobj.max);
 
   }, "text");

} // refresh_genlist()


// ----------------------------------------------------------------------------
// 
// Cleanup methods
// 

// Removes all draft generations from db.
Drafty.prototype.kill_all = function () {

   this.dmsg('Wipe all draft gens');

   args = { 'op':  'wipe',
            'ident': this.draft_ident };

   var that = this;  //this is not available in the post cb function
   $.post(this.ajax_url('killall'), args, function(jobj,status) {

      if (status != 'success') {
         console.error('ajax failed ' + status);
         //log_appl_err("save_draft() POST failed: " + status);
         return;
      }

      that.last_saved = that.last_restored = null;

      if ('msg' in jobj)
         that.errormsg('AJAX error:'+jobj.msg);    //msg from ajax script
      else
         that.dmsg('All '+jobj.cnt+' draft generations removed');

      that.refresh_genlist();    //Refresh genlist to show no drafts now

   }, 'json');

}


// ----------------------------------------------------------------------------
//
// Autosave methods.
//

// Internal method to reset the autosave timer
Drafty.prototype.autosave_init = function() {

   if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = null;
      this.dmsg('Autosave timer stopped');
   }
   
   if (this.autosave_secs > 0) {
      this.dmsg('Autosaving every '+this.autosave_secs+' seconds');
      var that = this;     //to make 'this' accessible from the inline function
      this.timer = window.setInterval(function() {
         that.save_draft(true);
      }, this.autosave_secs*1000);
   } else
      this.dmsg('Autosaving disabled');

} //autosave_init 


// Save draft automatically save draft after interval_secs has passed since last save
// and there is pending changes. Side effect: Saves draft too (for setting up timer).
// todo Automatically save draft after user has idled for idle_secs seconds (if any changes).
Drafty.prototype.autosave_setup = function(interval_secs) {

   this.autosave_secs = interval_secs;
   this.autosave_init();

} //autosave_setup 


Drafty.prototype.toggle_devmode = function() {
   this.setup_devmode( ! this.DEV_MODE );
   this.usermsg('Devmode is now '+(this.DEV_MODE?'enabled':'disabled'));
}


// ----------------------------------------------------------------------------

// OLD CODE BELOW - GET RID OF IT!!!!

// initialize drafts system
//window.onload = function() {

//include jquery
//include drafty storage mods

// console.log('drafts setup now');
//}


/********************** 

function autosave_input(html_id, draft_ident) {

// d = new Date();
// $("#draft_status").html('Udkast #'+jobj.gen+' gemt ' + d.hhmm());

   // Object init code

   // Monitor input textarea for changes whenever it has focus
   // http://stackoverflow.com/questions/3748930/javascript-onchange-detection-for-textarea

   function on_focus(that) {

      that.dmsg('FOCUS!');

      that.setup_timer();

      that.input_area.onblur = function() {
         window.clearInterval(that.timer);
         that.testForChange(that);
         that.input_area.onblur = null;
      };

   }
   
   xxthat = this;
   this.input_area.onfocus = function() {    //function needed to pass this to on_focus()
      on_focus(xxthat);
   };

} // autosave_input constructor

**********************/

// ----------------------------------------------------------------------------
// $Id: drafty.js 2094 2015-02-22 22:52:41Z shj $
// vim:aw:sw=3:ts=3:sts=3
// ----------------------------------------------------------------------------

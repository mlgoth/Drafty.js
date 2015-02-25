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
//  - Type of "saving now" notification:
//     - Cursor-change, <div> with text, silent, colour change on html elem
//     - Rotating ASCII
//     - Colourshifting &nbsp; (small colorbox that changes color with progress)
//  - "Saved" and "Not saved" indicators in green and red
//     - Like Google Docs, "All changes saved to drive"
//
//
// GC release functionality missing/incomplete
// -------------------------------------------
//  - Auto draft table cleanup
//  - Nicer genlist, not so many numbers, weekdays, not so wide, '5m', '3d'
//
//
// Github/Internet release TODO
// ----------------------------
//  - Missing:
//     - Multilanguage support, da-draft.js for danske tekster.
//     - demo-drafts.php - get rid of GC specific stuff
//     - backdraft-mysql.ajax.php - generic mysql BE, no GC-stuff
//     - Drafty demo-site on derkins, also release downloads here (github = dev downloads)
//     - Properly documented on the github wiki
//     - More great features :-)
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
//
//
//
// ----------------------------------------------------------------------------



// ----------------------------------------------------------------------------
/* Drafty constructor

Required arguments:
   draft_ident : uniquely identifies this particular draft - used as key in SQL db
   html_id     : id of input field whose content to save as drafts

Optional arguments:
   msg_id   : html id of div for status and debug output
   log_pane : html id of div for debug output - requires DEV_MODE to be true to work

*/

var Drafty = function(draft_ident, html_id, msg_id, log_pane) {

   this.DEV_MODE = true;     // a constant, actually

   this.draft_ident = draft_ident;
   this.html_id = html_id;
   this.last_restored = '';
   this.msg_id = msg_id ? msg_id : null;
   this.log_pane = log_pane ? log_pane : null;

   //todo what if the <div> isn't in the html?
   $('#drafty-box').css('visibility', 'visible');      //unhide if created hidden initially

   if (this.DEV_MODE && this.log_pane)
      $('#'+this.log_pane).css('visibility', 'visible');      //unhide if created hidden initially

   this.dmsg('Drafty object created');

} // Drafty constructor


// ----------------------------------------------------------------------------
// Private methods

Drafty.prototype.ajax_url = function(what) {
   var rval = 'ajax/backdraft-gc.ajax.php';        //todo URL should not be hardcoded
   if (this.DEV_MODE && what)
      rval += '?' + what;
   return rval;
}


// Print messages to log pane, if setup to do so
Drafty.prototype.dmsg = function(msg) {
   
   if ( ! this.DEV_MODE || ! this.log_pane )
      return;

   var id = '#'+this.log_pane;
   msg = new Date().toTimeString().substr(0, 8) + ' ' + msg + ' (' + this.html_id+ ')';
   $(id).html( msg + '<br>' + $(id).html() );

} // dmsg()


// Notify user of error condition
Drafty.prototype.errormsg = function(msg) {

   this.dmsg(msg);       //always log

   if ( ! this.msg_id )    //output user messages at all?
      return;

   this.usermsg('Draft problem: '+msg);   //NLS

} // Drafty.errormsg()


// ----------------------------------------------------------------------------
// Public methods

// Show message to user, maybe highlighted
Drafty.prototype.usermsg = function(msg) {

   if (msg)
      this.dmsg('uMsg: '+msg);       //always log

   if ( ! this.msg_id )    //output user messages at all?
      return;

   if (msg) {
      $('#'+this.msg_id).html('<span class="drafty-msg">&nbsp;'+msg+'&nbsp;</div>');
   } else
      $('#'+this.msg_id).html('');

} // Drafty.usermsg()


// ----------------------------------------------------------------------------
// 
// save_draft() method
// 
// Save draft to database, if it has changed
// If 'autosaving' is true, no usermsg() calls are made (unless a real error occurs).

Drafty.prototype.save_draft = function (autosaving) {

   this.usermsg();      //clear any old message

   var indicator = document.getElementById('drafty-asave-indicator') ? true : false;
   if (indicator) $('#drafty-asave-indicator').html('|');

   var currval = $('#' + this.html_id).val();

   // --- Do some sanity checks before saving ---
      
   // is there any text apart from WS?
   if ('' == currval.trim()) {    
      if (!autosaving)
         this.usermsg('Du har jo ikke skrevet noget');
      return;
   }

   // has text changed since last save?
   if (this.last_saved == currval) {    
      if (!autosaving)
         this.usermsg('Kladde ikke gemt - der er ingen ændringer');
      return;
   }

   // has text changed since last restore?
   if ((this.last_restored != '') && (currval == this.last_restored)) {
      if (!autosaving)
         this.usermsg('Ikke gemt - ingen ændringer siden gendannelse');
      return;
   }

   // --- Ok to save draft, go ahead ---

   document.body.style.cursor = 'progress';     // hourglass mouse cursor while we work

   if (indicator) $('#drafty-asave-indicator').html('/');
   this.dmsg('Saving draft');

   var args = { 'op':   'save',
                'data':  currval,
                'ident': this.draft_ident };

   // 'this' is not available in the inline function, so save it in a var that is
   var that = this;

   $.post(this.ajax_url('save'), args, function(jobj,status) {

//    console.log('jobj:');
//    console.log(jobj);

      if (indicator) $('#drafty-asave-indicator').html('-');

      if (status != 'success') {
         that.errormsg('save_draft() ajax failure ' + status);
         return;
      }

      if ( ! jobj || ! jobj.msg ) {    //todo errorcheck does not work
         that.errormsg('JSON unparseable');
         return;
      }

      //todo show error message, if any

      that.last_saved = currval;
      that.dmsg('ajax:'+jobj.msg);    //msg from ajax script

      that.dmsg('Draft #'+jobj.gen+' saved ');

      if (indicator) $('#drafty-asave-indicator').html('\\');
      that.refresh_genlist();
      if (indicator) $('#drafty-asave-indicator').html('');

      //todo doesn't work????
      document.body.style.cursor = 'default';           // mouse cursor back to normal igen

   }, 'json');

} // save_draft()


// ----------------------------------------------------------------------------
// 
// restore_draft() method
// 
// Restores the specified draft generation to the html input field
// Returns null for success, else an error message
// Only tested with <textarea>

Drafty.prototype.restore_draft = function (genno) {

   var args = { 'op':   'load',
                'genno':  genno,
                'ident':  this.draft_ident };

   var that = this;
   $.post(this.ajax_url('restore'), args, function(jobj,status) {

      $('#' + that.html_id).val(jobj.data);
      that.last_restored = jobj.data;

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

/***
 * todo?
// Returns highest draft genno if draft(s) exists, if none exists false is returned.
Drafty.prototype.got_drafts = function () {
}
***/


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


// ----------------------------------------------------------------------------

// OLD CODE BELOW - GET RID OF IT!!!!

// initialize drafts system
//window.onload = function() {

// div = '<span id="draft_status"></span>';
// $('#draft_hdiv1').html(div);
// $('#draft_status').html('Initial status!');

//   div = '<div id="draft_msg" style="background:pink; font-size:large">draft_msg</div>';
//   $('#draft_botdiv').html(div);
//   $('#draft_msg').html('Initial message!');

// console.log('drafts setup now');
//}


// ------------------------------------------------------------------------
// Class (object)
// ------------------------------------------------------------------------

/*
  var as1 = new autosave_input('commenthead', 'thread:'+kp_ct_type+':'+kp_ct_id);
  as1.try_load();

todo
----
 - Autosave bliver ikke enabled efter ajax paging i kpager
 - Check for forsvundet kladde i db ved onfocus
    - Hvis bruger har slettet eller postet fra en anden browser
    - alert("Die udkast ist phersvünden!");



var params = [
   input_id: 'kommentar_body',   // Input field to autosave drafts from
   autosave_after_idle_secs: 5,        // 0 to disable idle saving
   autosave_every_secs: 60,            // Only on changes though
   message_elem_id: 'drafty_msgs',     // "All changes saved"
   browser_save: true,
   server_save: true,
];

*/

function autosave_input(html_id, draft_ident) {

   // !!! further initialization code at the bottom 

   function testForChange(that) {
      if (! that)
         that = this;
      if (that.input_area.value == that.last_saved)
         return;     //no changes since last save
      that.save_draft();
   }

   function clear_timer() {
      if (this.timer) {
         window.clearInterval(this.timer);
         this.timer = null;
      }
   }

   function setup_timer() {
      this.clear_timer();
      var that = this;
      this.timer = window.setInterval(function() {
         testForChange(that);
      }, 8*1000);
   }

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


// ----------------------------------------------------------------------------
// $Id: drafty.js 2094 2015-02-22 22:52:41Z shj $
// vim:aw:sw=3:ts=3:sts=3
// ----------------------------------------------------------------------------

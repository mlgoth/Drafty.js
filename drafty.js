// ----------------------------------------------------------------------------
//
// drafty.js - https://github.com/mlgoth/Drafty.js
// Draft saving objects for HTML input fields.
// jQuery required.
// Copyright (C) Stig H. Jacobsen 2013-2015
//
//
// Before-prod TODO
// ----------------
//  - All HTML id's should be named "drafty-XXX"
//  - Implement testForChange() from old drafts.js?
//  - Test with multiple Drafty objects on a single webpage
//
//
// Github/Internet release TODO
// ----------------------------
//  - Missing:
//     - Better multilanguage support, da-draft.js for danske tekster?
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
//
//
// Future functionality TODO
// -------------------------
//  - "Saved" and "Not saved" indicators in green and red
//     - Like Google Docs, "All changes saved to drive"
//  - Optionally use localStorage[] to save drafts instead of a backend script on the webserver
//     - DraftyWBE inherits Drafty, uses webserver BE script as draft storage
//     - DraftyH5 or DraftyLS or DraftyH5LS (HTML5/localStorage cryptically to make 
//       ppl wondering :-) also inherits Drafty
//  - Warn user when leaving page (and there is unsaved text)
//  - Autosave timer stop on blur (after save), start on focus
//       this.input_area = document.getElementById(this.html_id);
//       this.input_area.onblur = myfunc;
//     - Will this save a lot or a little cpu?
//  - Smart unobtrusive idle autosaving
//     - Idle autosave functionality should be separate from this and go on top of
//       this, with the autosave-code using methods here to do the actual saving?
//        - (user)idledetector.js - class for invoking user functions on user idling in browser
//  - Support for UTF-8
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
// ----------------------------------------------------------------------------


// ----------------------------------------------------------------------------
/* Drafty constructor

Required arguments:
   draft_ident : uniquely identifies this particular draft - used as key in SQL db

Optional arguments:
   html_id     : HTML id or class of input field(s) whose content to save as drafts

*/

var Drafty = function(draft_ident, html_id) {

   this.backend_url = 'backdraft-mysql.ajax.php';      //the default, object creator can override

   this.draft_ident = draft_ident;
   this.html_id = html_id ? html_id : '.drafty-inputs';
   this.last_restored = '';
   this.msg_id = null;  // defaults to drafty-umsg, but can be overridden in object
   this.uid = '0';      //just some value until object owner overrides it with set_userid()

   // Default messages shown to end user - these can be overriden in usercode to talk a different language
   this.umsgs = { 
                  'no_text':  'No text have been input - nothing to save',
                  'no_chg1':  'Draft not saved - there are no changes',
                  'no_chg2':  'Draft not saved - no changes since last restore',
                  'ajax_err': 'Drafty AJAX problem'
                };

   //todo what if the <div> isn't in the html?
   $('#drafty-box').css('visibility', 'visible');      //unhide if created hidden initially

   console.log('html_id '+this.html_id);
   if (this.html_id.substr(0,1) == '.')      // A class like .drafty-inputs ?
      this.inputs_list = document.getElementsByClassName(this.html_id.substr(1));
   else
      this.inputs_list = [ document.getElementById(this.html_id) ];     // Single html id

   this.initial_data = this.fetch_inputs();

   // This JS is run when user clicks a draft gen to restore it
   // %d is replaced by the generation number
   // .restore_js can be replaced with user code as needed
   //todo doesn't work!
   this.restore_js = this.constructor.name + '.restore_draft(%d);';
// console.log(this);

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
         // show if created hidden initially
         $(this.log_pane).css('display', 'block');
         $(this.log_pane).css('visibility', 'visible');
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

// usermsg logs? this.dmsg(msg);       //always log

   this.usermsg(msg, "drafty-error"); //NLS

} // Drafty.errormsg()


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


Drafty.prototype.really_save = function(data){

   var args = { 'op':    'save',
                'uid':   this.uid,
                'data':  data,
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
         that.last_saved = data;
         that.dmsg('Draft #'+jobj.gen+' saved');
      }

      if (that.saving_cb)
         that.saving_cb(0);      //save finished

   }, 'json');

} // really_save()


Drafty.prototype.restore_data = function (json_data, genno) {

   this.dmsg('restoring '+genno+' => '+ json_data);

   var inputs = JSON.parse(json_data);
   for (var key in inputs) {
      if (inputs.hasOwnProperty(key)) {
         // console.log(key + " -> " + inputs[key]);
         $('#' + key).val(inputs[key]);
      }
   }

   this.last_restored = jobj.data;

   this.dmsg('Draft #'+genno+' restored ');

} // restore_data()


// ----------------------------------------------------------------------------
// Public methods


// Call this after object construction, if your application/page/site
// supports multiple (web)users. 'userid' can be either a string or a number.
Drafty.prototype.set_userid = function(userid) {
   this.uid = userid;
} // Drafty.set_userid()


// Show message to user, maybe highlighted
Drafty.prototype.usermsg = function(msg, css_class) {

   if (msg)
      this.dmsg('uMsg: '+msg);       //always log

   if ( ! this.msg_id )    //output user messages at all?
      if ( document.getElementById('drafty-umsg') )      //by default output msgs to this
         this.msg_id = 'drafty-umsg';
      else
         this.msg_id = 'NONE';      //no <div> for msgs, so disable them

   if ( this.msg_id == 'NONE' )    //output user messages at all?
      return;

   if (msg) {
      if (!css_class)
         css_class = 'drafty-msg';
      $('#'+this.msg_id).html('<span class="'+css_class+'">&nbsp;'+msg+'&nbsp;</span>');
   } else
      $('#'+this.msg_id).html('&nbsp;');     //to avoid the <div> "collapsing" due to being empty

} // Drafty.usermsg()


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

   this.really_save(inputs_json);

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

   var args = { 'op':    'load',
                'uid':   this.uid,
                'genno': genno,
                'ident': this.draft_ident };
   var that = this;

   $.post(this.ajax_url('restore'), args, function(jobj,status) {

      // if (jobj.msg)
      //    this.dmsg('ajax:'+jobj.msg);    //msg from ajax script
      // else ...

      that.restore_data(jobj.data, genno);

   }, 'json');

}


// ----------------------------------------------------------------------------
// 
// Genlist methods
// 


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
   var args = {'op':'genlist', 'ident':this.draft_ident, 
               'uid':this.uid,
               'cb':this.restore_js};

   // This variant catches garbled JSON (error 3)
   $.post(this.ajax_url('genlist'), args, function(data,status) {
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

   args = { 'op':    'wipe',
            'uid':   this.uid,
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

   //todo NLS for texts
   this.usermsg( (interval_secs == 0) ? "Timed autosave have been disabled" : "Timed autosave have been disabled");

} //autosave_setup 


Drafty.prototype.toggle_devmode = function() {
   this.setup_devmode( ! this.DEV_MODE );
   this.usermsg('Devmode is now '+(this.DEV_MODE?'enabled':'disabled'));
}


// ----------------------------------------------------------------------------
// DraftyLS inherited object for localStorage[] storage instead of AJAX backend
// ----------------------------------------------------------------------------

var DraftyLS;
// DraftyLS.prototype = new Drafty();        // Here's where the inheritance occurs 
DraftyLS.prototype = Object.create(Drafty.prototype);

/*
Cat.prototype.constructor=Cat;       // Otherwise instances of Cat would have a constructor of Mammal 
function Cat(name){ 
   this.name=name;
} 
*/

// --- Methods private/specific to DraftyLS ---

// Returns key for localStorage[] without genno
DraftyLS.prototype.base_lskey = function() {

   return 'Drafty.js-' + this.draft_ident + '-' + this.uid;

} //mk_lskey


// --- Methods from parent object that we override ---

DraftyLS.prototype.really_save = function(data){

   var genno,
       lskey = this.base_lskey() + '-';

   //todo figure out which genno to create/overwrite
   genno = 42;

   localStorage[ lskey + genno ] = data;     // JSON format
   localStorage[ lskey + 'HW' ] = genno;     // highest genno in use

   //todo the rest is somewhat a copy from Drafty.really_save()
   this.refresh_genlist();

   this.last_saved = data;
   this.dmsg('Draft #'+genno+' saved');

   if (this.saving_cb)
      this.saving_cb(0);      //save finished

} // really_save()


DraftyLS.prototype.restore_draft = function (genno) {

   var lskey = this.base_lskey() + '-';

   //todo verify that key exists
   this.restore_data( localStorage[ lskey + genno ], genno );

} // restore_draft()


DraftyLS.prototype.refresh_genlist = function (callback) {

   var lskey = this.base_lskey() + '-',
       genno = localStorage[ lskey + 'HW' ],
       num_gens = 0,
       maxgen = 0,
       html = '';

   if ( i )
      while ( lskey+genno in localStorage ) {
         num_gens++;
         if (genno > maxgen)
            maxgen = genno;

         $html += '<a class="drafty-link" href="javascript:drafty_restore_genno('
                  + genno + ', \'' + this.draft_ident + '\');" title="Data:'
                  + localStorage[ lskey+genno ] + '">'
                  + lskey+genno + '</a><br>';  //todo save_time

         genno--; //previous draft, if any
      }

   if (num_gens == 0)
      html = "No saved drafts";
   else
      if (callback)
         callback(maxgen);

   $('#drafty-genlist').html(html);
   this.dmsg('Genlist refreshed, have '+num_gens+' draft generations');

} // refresh_genlist()


// ----------------------------------------------------------------------------

// Monitor input textarea for changes whenever it has focus
// http://stackoverflow.com/questions/3748930/javascript-onchange-detection-for-textarea

/********************** 

todo auto save_draft() on blur?

      that.input_area.onblur = function() {
         window.clearInterval(that.timer);
         that.testForChange(that);
         that.input_area.onblur = null;
      };


**********************/

// ----------------------------------------------------------------------------
// $Id: drafty.js 2094 2015-02-22 22:52:41Z shj $
// vim:aw:sw=3:ts=3:sts=3
// ----------------------------------------------------------------------------

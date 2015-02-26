<?php
// 
// demo-drafty.php, 11-Feb-2015/shj
// Demonstration page for Drafty.js
// https://github.com/mlgoth/Drafty.js/wiki
// 
// TODO 
//  - Get rid of the PHP
//  - Test with multiple Drafty objects on a single webpage
//  - Validate HTML
//     http://validator.w3.org/check?uri=http%3A%2F%2Fhobbes.gyzzz.eu%2F~shj%2Fdrafty%2Fdemo-drafty.php
// 
?>
<!DOCTYPE HTML>
<html lang="en" style="height:100%">

<head>
   <META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=ISO-8859-1">
   <title>Drafty.js demoo</title>

   <style type="text/css">

      /* '#' er id og '.' er class, husk det nu. */

      a.drafty-link:link, a.drafty-link:visited {     /* plain and black on no mouseover */
         text-decoration:none;
         color:black;
      }

      a.drafty-link:hover {            /* underline and blue on mouseover */
         text-decoration:underline;
         cursor:pointer;
         color:blue;
      }

      #drafty-logpane {

         /*this makes scrollbar appear as needed*/
         clear: both;
         overflow-y: auto;

         border:     1px solid black;
         height: 20em;
         width:      50em;

         padding:    7px;
/*       float:      right;*/
         text-align: left;
         background: SkyBlue;
         font-size:  11pt;

         visibility: hidden;  /* JS unhides as needed */
      }

      #drafty-box {
         border: 1px solid black;
         text-align:center;
         width:12em;
         background: DarkSeaGreen;
         font-size:10pt;
      }

      #drafty-genlist {
         /* this makes scrollbar appear as needed*/
         clear: both;
         overflow: auto;
         height: 10em;
      /* background: DarkSeaGreen;*/
      }

      #drafty-knobs {
         padding: 5px;
      }

      #drafty-as-setting {
         width: 6.5em;
      }

      #draft_status {
         font-size:small;
         background:yellow;
         padding-left:5em;
      }

   </style>

   <script src="http://ajax.googleapis.com/ajax/libs/jquery/1.8.3/jquery.min.js"></script>

   <XXX using jquery .getscript below() but this works too: script src="drafty.js"></script>

</head>

<body><center>
<?php

error_reporting(E_ALL|E_STRICT);

$myuserid = 42;      // Set this when user logs in

if ( ! $myuserid )
   die("Must be logged in to use this page");  //userid required


// --- Main HTML ----------------------------------------------------------

?>

<h2>Demo of Drafty.js with a PHP/MySQL backend</h2>

<table cellpadding="10" border=0 width="95%" align="center">

<tr>

   <td>

   Heading:&nbsp;&nbsp;
   <input type="text" size=60 id="commenthead" name="commenthead" maxlength=100 value="this input field does not save drafts">
   <br>
   <br>

   <div id="textarea-container">
      <textarea id="commenttext" cols="75" rows="7"></textarea>
      <div id="usermsg">&nbsp;</div>
      <br>
      <div>
         Autosave:
<select id="autosave-select">
   <option value="3">Often</option>
   <option selected="" value="60">Regularly</option>
   <option value="600">Rarely</option>
   <option value="0">Don't autosave</option>
</select>
      </div>
   </div>
   
   </td>

   <td>
    <div id="drafty-box">
      <b onclick="draft1.toggle_devmode();"><u>Draft generations</u></b>
      <div id="drafty-genlist"></div>
      <div id="drafty-knobs">
         Autogem:
<select id="drafty-as-setting">
<option value="3">Hele tiden</option>
<option selected="" value="60">Jævnligt</option>
<option value="600">Sjældent</option>
<option value="0">Lad dog være</option>
</select>
<br>
         <div style="padding-top:5px;">
            <button id="save_button">Gem</button>
            &nbsp;
            <button id="kill_button" onclick="kill_drafts();">Slet alle</button>
         </div>
      </div>
     </div>
   </td>

</tr>
</table>

<br>

<div id="drafty-logpane"></div>

<br>

<?php


// --- JavaScript setup ---------------------------------------------------

// Set JS variable from PHP variable
echo '
<script type="text/javascript">
   var draft_ident = "test-drafts-u'.$myuserid.'";
</script>';

?>

<script type="text/javascript">

   console.log('Script inline JS runs');

   var draft1,
       website_userid;
   var LS_AUTOSAVE_SETTING = 'drafty-autosave',    //actually a constant
       LS_USERID = 'drafty-demo-userid',
       DRAFTY_AUTOSAVE_DEFAULT = 60;   //ditto

   function restore_genno(genno) {
      draft1.restore_draft(genno);
   }

   // Removes all draftgens from table
   function kill_drafts() {
      draft1.kill_all();
      draft1.usermsg('All draft generations have been nuked');
      draft1.refresh_genlist();
   }

   function random_int(min,max) {
      return Math.floor((Math.random() * max) + min);
   }

   // Create a random userid for the demo as we have no login here
   if ( ! (LS_USERID in localStorage) )
      localStorage[ LS_USERID ] = random_int(1,1000*1000);
   website_userid = localStorage[ LS_USERID ];

   $.getScript("drafty.js", function(response,status){

      // console.log("Script loaded and executed. Status: "+status);

      draft1 = new Drafty(draft_ident, 'commenttext', 'usermsg');  //global var
      draft1.backend_url = 'backdraft-mysql.ajax.php';

      // Called when Drafty.js is saving a draft
      draft1.saving_cb = function(stage) {
         switch (stage) {
            case 1: // save starts - hourglass mouse cursor while we work
                    document.body.style.cursor = 'progress';     
                    break;
            case 0: document.body.style.cursor = 'default';           // mouse cursor back to normal igen
                    break;
         } //switch
      };

      //todo notify user in colours if old drafts are found
      draft1.refresh_genlist(function (max) {
         console.log('Got draft(s) for '+draft1.draft_ident);
         draft1.restore_draft(max);
         //todo: error-checking, let user know if restore failed
         draft1.logmsg('Restored latest draft on drafty.j load');
         if (draft1.DEV_MODE)
            draft1.usermsg('Tekst gendannet fra seneste kladde');
         else
            alert('Teksten er gendannet fra din seneste kladde');    // Horrible, ugly popup
      });

      // Restore users autosave setting from browser LS
      //todo move to drafty.js somehow
      var asave = DRAFTY_AUTOSAVE_DEFAULT;
      if (LS_AUTOSAVE_SETTING in localStorage)
         asave = localStorage[ LS_AUTOSAVE_SETTING ];

      draft1.autosave_setup(asave);
      $("#drafty-knobs select").val(asave);

      // Invoked when user changes autosave interval
      $('#drafty-as-setting').change(function() { 

         var newval = this.value;

         // Save new user setting to LS
         if (newval == DRAFTY_AUTOSAVE_DEFAULT)
            delete localStorage[LS_AUTOSAVE_SETTING];    //don't save the default value, waste of space
         else
            localStorage[ LS_AUTOSAVE_SETTING ] = newval;

         // Adjust object autosave timer
         draft1.autosave_setup(newval);

         draft1.logmsg('autosave set to '+newval);
      } );

      $('#save_button').click(function(){
         draft1.save_draft();
      });

      console.log('The drafts subsystem is up');
   });

</script>

</center></body>

<?php


// --- All done -----------------------------------------------------------

return;


// ------------------------------------------------------------------------
// $Id: test-drafts.php 2092 2015-02-22 18:48:20Z shj $
// vim:aw:
// ------------------------------------------------------------------------
?>

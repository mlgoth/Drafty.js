<?php
// test-drafts.php, 11-Feb-2015/shj
/*

todo 
 - Test with multiple Drafty objects on a single webpage
 - draft_content.class.php?

to situationer der ikke h�ndteres, fordi alle drafts slettes ved gem:
 - stor del markeret tekst, rammer en tast (markeret tekst forsvinder)
   og f�r ramt Gem-knappen bagefter - kladderne blev slettet, da der blev trykket Gem
 - Der sker noget andet med teksten (katten sover p� keyboardet) og bruger trykker
   Gem uden at checke teksten efter f�rst.

*/

define('FEATURE_STRICT_PHP', true);

require_once 'site.inc.php';

if (envir::is_cli())
   die("PHP syntax check is complete\n");


// '#' er id og '.' er class, husk det nu.
$CSS = <<<'PAGE_STYLING'

a.drafty-link:link, a.drafty-link:visited {     /* plain and black on no mouseover */
   text-decoration:none;
   color:black;
}

#drafty-logpane {
   /*this makes scrollbar appear as needed*/
/* doesn't work :(
   clear: both;
   overflow: auto;
   display: block;
*/

   overflow-y: auto;
   border:     1px solid black;
   height: 20em;
   clear: both;
   width:      30em;

   padding:    7px;
   float:      right;
   text-align: left;
   background: DarkSeaGreen;
   font-size:  11pt;

   visibility: hidden;  /* JS unhides as needed */
}

#drafty-box {
   border: 1px solid black;
   text-align:center;
   width:12em;
   background:SkyBlue;
   font-size:10pt;
}

#drafty-genlist {
   /*todo: when this works, it makes scrollbar appear as needed*/
   clear: both;
   overflow: auto;
   height: 10em;
   background: DarkSeaGreen;
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

PAGE_STYLING;


// ------------------------------------------------------------------------

$page = new geekpage('xhtml', "Kladdetester");
$page->page_css($CSS);
$page->caching = 'disable';
$page->start();

jsmisc::src('drafty');

if ($u->anon())
   die("Du skal v�re logget ind for at bruge denne side");  //vi gemmer med userid


// --- Main HTML ----------------------------------------------------------

echo <<<'HTML'

<h2>Test af kladdesystemet</h2>

<table cellpadding="10" border=0 width="95%" align="center">

<tr>

   <td>

   Overskrift:&nbsp;&nbsp;
   <input type="text" size=60 id="commenthead" name="commenthead" maxlength=100 value="overskriftskladde gemmes ikke">
   <br>
   <br>

   <div id="textarea-container">
      <textarea id="commenttext" cols="75" rows="7"></textarea>
      <div id="usermsg"></div>
      <br>
      <div>
         <button>Demoknap 1</button>
         &nbsp;&nbsp;
         <button >2</button>
      </div>
   </div>
   
   </td>

   <td>
    <div id="drafty-box">
      <b>Kladder</b>
      <span id="drafty-asave-indicator">!!</span>
      <div id="drafty-genlist"></div>
      <div id="drafty-knobs">
         Autogem:
<select id="drafty-as-setting">
<option value="3">Hele tiden</option>
<option selected="" value="60">J�vnligt</option>
<option value="600">Sj�ldent</option>
<option value="0">Lad dog v�re</option>
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

   <td id="drafty-logpane">
   </td>

</tr>
</table>

<br>

HTML;


// --- JavaScript setup ---------------------------------------------------

// Set JS variable from PHP variable
//todo isn't there already a global GC var with the gc userid?
echo jsmisc::outstr('var draft_ident = "test-drafts-u'.$u->uid().'";'),

     <<<'JSCODE'

<script type="text/javascript">

   var draft1;
   var LS_AUTOSAVE_SETTING = 'drafty-autosave',    //actually a constant
       DRAFTY_AUTOSAVE_DEFAULT = 60;   //ditto

   console.log('Script inline JS runneth!');

   function restore_genno(genno) {
      draft1.restore_draft(genno);
   }

   // Removes all draftgens from table
   function kill_drafts() {
      draft1.kill_all();
      draft1.logmsg('Alle kladder er nu fjernet');
      draft1.refresh_genlist();
   }

   $.getScript("js/drafty.js", function(response,status){

      // console.log("Script loaded and executed. Status: "+status);

      draft1 = new Drafty(draft_ident, 'commenttext', 'usermsg', 'drafty-logpane');  //global var

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

      console.log('Kladdesystemet er klar til aktion');
   });

</script>

JSCODE;


// --- All done -----------------------------------------------------------

$page->ends();
return;


// ------------------------------------------------------------------------
// $Id: test-drafts.php 2092 2015-02-22 18:48:20Z shj $
// vim:aw:
// ------------------------------------------------------------------------
?>
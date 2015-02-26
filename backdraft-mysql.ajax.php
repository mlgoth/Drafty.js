<?php
// ----------------------------------------------------------------------------
//
// backdraft.ajax.php - Sample AJAX backend in php for drafty.js
// @author 11-Feb-2015/shj
//
//
// TODO
// ----
//  - Test æ, ø, å support, save'n'restore
//  - Test ", ' and \n for save & restore
//  - Support UTF-8
//  - Test with other browsers and platforms
//
//
// POST arguments
// --------------
// op: What operation to perform
//
// Other args depends on the op.
//
//
// Return values in JSON
// ---------------------
// html  Set for ops that returns HTML
// msg   Error message if set
//
//
// ----------------------------------------------------------------------------

error_reporting(E_ALL|E_STRICT);

set_include_path('/home/shj/d/pipestore/lib:' . get_include_path());

require_once('envir.class.php');
require_once('godb_i.class.php');


// --- Script configuration ---------------------------------------------------

global $MySiteSetup;
$MySiteSetup = array(

   'host'   => 'localhost',
   'dbname' => 'shj',
   'user'   => 'shj',
   'pass'   => 'Latte'

);

global $db;
$db = new godb_i();


// Newest draft generation in DB must be this number of seconds old
// before creating a new one (INSERT) instead of UPDATE'ing latest draft.
define('DRAFT_GEN_INTERVAL_SECS', 1*60);

define('DRAFT_GEN_KEEP', 100);

$myuserid = 42;      // Set this when user logs in


// --- Is this running from a webserver? --------------------------------------

//if (envir::is_cli())
//   die("Welcome to the wonderfull world of HTML5, AJAX and JSON!\nNow test this code on a webpage.");

if (empty($_POST['op'])) {   // require _POST when in prod to make hacking a bit more bothersome
   if (false)
      die("This seems not to be legit interfacing");
   
   // Run simple test when script is invoked from the shell
   $_REQUEST['ident'] = 'Unit test!';
   $_REQUEST['data'] = "Sample draft data";
   save_draft_POST($myuserid);
   exit(0);
}


// --- Main -------------------------------------------------------------------

switch ($_REQUEST['op']) {
   case 'save':
      save_draft_POST($myuserid);
      break;
   case 'genlist':
      genlist_POST($myuserid);
      break;
   case 'load':
      load_draft_POST($myuserid);
      break;
   case 'wipe':
      killall_POST($myuserid);
      break;
   default:
      die("Illicit behavior detected");
} //switch op

exit(0);


// ----------------------------------------------------------------------------

// POST inputs:
//   ident => drafts.draft_ident
//   data => text to save

// Save draft text to db, creating a new generation of the draft if the
// previous save was created more than DRAFT_GEN_INTERVAL_SECS ago.
function save_draft_POST($userid) {

   global $db;
   $draft_ident = $_REQUEST['ident'];
   $data = utf8_decode($_REQUEST['data']);

   $where = sprintf('
       WHERE userid=%d 
         AND draft_ident="%s"
      ', $userid, myres($draft_ident));

   // Does draft exist already?
   $row = $db->trys('SELECT draftid,
                             generation,
                             UNIX_TIMESTAMP(NOW()) - UNIX_TIMESTAMP(create_time) AS age_in_secs
                        FROM drafty_drafts '.$where.'
                       ORDER BY generation DESC LIMIT 1');

//var_dump($row);

   if ($row['draftid'] && $row['age_in_secs'] < DRAFT_GEN_INTERVAL_SECS) {
      $db->e_update('drafty_drafts', 'WHERE draftid='.$row['draftid'], array(
                     'save_time'   => 'NOW()',
                     '!draft_data' => $data));
      $draftid = $row['draftid'];
   } else {
      // Create new draft generation as none exists or the newest gen is too old
      $insrow = array(
                     'userid'       => $userid,
                     '!draft_ident' => $draft_ident, 
                     'create_time'  => 'NOW()',
                     'save_time'    => 'NOW()',
                     'generation'   => $row['generation'] + 1,
                     '!draft_data'  => $data
                    );
      $db->e_insert('drafty_drafts', $insrow);
      $draftid = $db->last_insert_id();
      logit('info', 'Saved draft #'.$draftid.' by '.$userid . ' ['. $draft_ident .']');

if (false) {
      // After another insert, check for old drafts and cleanup as needed
      $cnt = $db->qsel('select count(*) from drafty_drafts'.$where);
      if ($cnt > DRAFT_GEN_KEEP)
         $db->raw_sql('delete from drafty_drafts'.$where.' order by generation limit '.($cnt-DRAFT_GEN_KEEP));
}

   }

   $gen = $db->qsel('SELECT MAX(generation) FROM drafty_drafts WHERE draftid='.$draftid);
// $msg = sprintf('Save successfull gen #%d af id=%d [%s]',
//                $gen, $draftid, $draft_ident);
   if ($msg)
      $result['msg'] = utf8_encode($msg);
   $result['gen'] = $gen;
   echo json_encode( $result );

} // save_draft_POST()


// ----------------------------------------------------------------------------
// POST inputs:
//   ident => drafts.draft_ident
//   genno => drafts.generation
function load_draft_POST($userid) {

   global $db;

   $kladde = $db->trys(sprintf('
                         SELECT draft_data 
                           FROM drafty_drafts
                          WHERE userid=%d
                            AND draft_ident="%s"
                            AND generation=%d', 
                         $userid, 
                         myres($_REQUEST['ident']),
                         myres($_REQUEST['genno'])));

   if (empty($kladde))
      $msg = 'No such draft!';
   else
      //Where do all this \-junk come from?
      $result['data'] = utf8_encode( stripslashes(str_replace('\n', "\n", $kladde)));

   $result['msg'] = utf8_encode($msg);
   echo json_encode( $result );

} // load_draft_POST()


// ----------------------------------------------------------------------------

// POST inputs:
//   draft_id => drafts.draft_ident
// Returns:
// 'html' vertical <ul> with list of draft generations to be put in a <div> or <td>
// 'cnt'  Number of existing draft generations for draft_id
// 'max'  Highest existing generation for id
function genlist_POST($userid) {

   global $db;

   $draft_ident = $_REQUEST['ident'];

   $sql = sprintf('
      SELECT *, TIME(save_time) 
        FROM drafty_drafts 
       WHERE userid=%d 
         AND draft_ident="%s"
       ORDER BY save_time DESC
      ', $userid, myres($draft_ident));

   $result['max'] = 0;
   $msg = '';
   $q = $db->select($sql);

   if ($q->nrows() == 0) {
      $msg = "No saved drafts";
      $html = 'Ingen kladder';
   } else {
      while ($row = $q->next_assoc()) {
         if ($row['generation'] > $result['max'])
            $result['max'] = $row['generation'];
         $html .= sprintf('<a class="drafty-link" href="javascript:drafty_restore_genno(%d, \'%s\');">%s</a><br>',
                          $row['generation'], $draft_ident, $row['save_time']);
      }
   }

   $result['cnt'] = $q->nrows();
   if ($msg != '')
      $result['msg']  = utf8_encode($msg);
   if ($html != '')
      $result['html'] = utf8_encode($html);
   echo json_encode( $result );

} // genlist_POST()


// ----------------------------------------------------------------------------

// POST inputs:
//   draft_id => drafts.draft_ident
// Returns cnt with number of drafts removed
// 'msg' is set for errors
function killall_POST($userid) {

   global $db;

   $draft_ident = $_REQUEST['ident'];

   $sql = sprintf('
      DELETE
        FROM drafty_drafts 
       WHERE userid=%d 
         AND draft_ident="%s"
      ', $userid, myres($draft_ident));

   if (($result['cnt'] = $db->raw_delete($sql)) == 0)
      $msg = 'Ingen kladder fundet for '.$draft_ident;

   if ($msg != '')
      $result['msg']  = utf8_encode($msg);
   echo json_encode( $result );

} // killall_POST()


// ----------------------------------------------------------------------------
// POST inputs:
//   ident => drafts.draft_ident
// Returns 'cnt' with number of existing draft generations.
// 'maxgen' are only set if any draft(s) are found.

// todo just return maxgen? also return timestamp for latest draft?
/**** unused
function count_drafts_POST() {

   $uid = $u->uid();
   $ident = myres($_REQUEST['ident']);

   $sql = sprintf('SELECT COUNT(*) AS cnt FROM drafts WHERE userid=%d AND draft_ident="%s"',
                    $uid, $ident);
   if ( $result['cnt'] = $db->trys($sql)) {
      $row = $db->qself('SELECT MAX(generation) AS maxgen 
                            FROM drafts
                           WHERE userid=%d AND draft_ident="%s"',
                         $uid, $ident);
      $result['maxgen'] = $row['maxgen'];
   } else
      $result['cnt'] = 0;   //no existing drafts

   echo json_encode( $result );

} //count
**************/

// ----------------------------------------------------------------------------
// $Id: backdraft.ajax.php 2092 2015-02-22 18:48:20Z shj $
// vim:aw:
// ----------------------------------------------------------------------------
?>

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

define('GEEK_AJAX_SCRIPT', true);
require_once 'site.inc.php';

if (envir::is_cli())
   die("Welcome to the wonderfull world of HTML5, AJAX and JSON!\nNow test this code on a webpage.");

if (empty($_POST['op']))    // require _POST when in prod to make hacking a bit more bothersome
   die("This seems not to be legit interfacing");


// Newest draft generation in DB must be this number of seconds old
// before creating a new one (INSERT) instead of UPDATE'ing latest draft.
define('DRAFT_GEN_INTERVAL_SECS', 1*60);

define('DRAFT_GEN_KEEP', 100);


// --- Main -------------------------------------------------------------------

switch ($_REQUEST['op']) {
   case 'save':
      save_draft_POST();
      break;
   case 'genlist':
      genlist_POST();
      break;
// case 'gotany':
//    count_drafts_POST();
//    break;
   case 'load':
      load_draft_POST();
      break;
   case 'wipe':
      killall_POST();
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
function save_draft_POST() {

   global $u, $gdb;
   $userid = $u->uid();
   $draft_ident = $_REQUEST['ident'];
   $data = utf8_decode($_REQUEST['data']);

   $where = sprintf('
       WHERE userid=%d 
         AND draft_ident="%s"
      ', $userid, myres($draft_ident));

   // Does draft exist already?
   $row = $gdb->trys('SELECT draftid,
                             generation,
                             UNIX_TIMESTAMP(NOW()) - UNIX_TIMESTAMP(create_time) AS age_in_secs
                        FROM drafts '.$where.'
                       ORDER BY generation DESC LIMIT 1');

   if ($row['draftid'] && $row['age_in_secs'] < DRAFT_GEN_INTERVAL_SECS)
      $gdb->e_update('drafts', 'WHERE draftid='.$row['draftid'], array(
                     'save_time'   => 'NOW()',
                     '!draft_data' => $data));
   else {
      // Create new draft generation as none exists or the newest gen is too old
      $insrow = array(
                     'userid'       => $userid,
                     '!draft_ident' => $draft_ident, 
                     'create_time'  => 'NOW()',
                     'save_time'    => 'NOW()',
                     'generation'   => $row['generation'] + 1,
                     '!draft_data'  => $data
                    );
      $gdb->e_insert('drafts', $insrow);
      $draftid = $gdb->last_insert_id();
      logit('info', 'Saved draft #'.$draftid.' by '.$u->uname() . ' ['. $insrow['draft_ident'] .']');

if (false) {
      // After another insert, check for old drafts and cleanup as needed
      $cnt = $gdb->qsel('select count(*) from drafts'.$where);
      if ($cnt > DRAFT_GEN_KEEP)
         $gdb->raw_sql('delete from drafts'.$where.' order by generation limit '.($cnt-DRAFT_GEN_KEEP));
}

   }

   $gen = $gdb->qsel('SELECT MAX(generation) FROM drafts WHERE draftid='.$draftid);
   $msg = sprintf('Save successfull gen #%d af id=%d [%s]',
                  $gen, $draftid, $draft_ident);
   $result['msg'] = utf8_encode($msg);
   $result['gen'] = $gen;
   echo json_encode( $result );

} // save_draft_POST()


// ----------------------------------------------------------------------------
// POST inputs:
//   ident => drafts.draft_ident
//   genno => drafts.generation
function load_draft_POST() {

   global $u, $gdb;

   $kladde = $gdb->trys(sprintf('
                         SELECT draft_data 
                           FROM drafts
                          WHERE userid=%d
                            AND draft_ident="%s"
                            AND generation=%d', 
                         $u->uid(), 
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
function genlist_POST() {

   global $u, $gdb;
   $userid = $u->uid();

   $draft_ident = $_REQUEST['ident'];

   $sql = sprintf('
      SELECT *, TIME(save_time) 
        FROM drafts 
       WHERE userid=%d 
         AND draft_ident="%s"
       ORDER BY save_time DESC
      ', $userid, myres($draft_ident));

   $result['max'] = 0;
   $msg = '';
   $q = $gdb->select($sql);

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
function killall_POST() {

   global $u, $gdb;
   $userid = $u->uid();

   $draft_ident = $_REQUEST['ident'];

   $sql = sprintf('
      DELETE
        FROM drafts 
       WHERE userid=%d 
         AND draft_ident="%s"
      ', $userid, myres($draft_ident));

   if (($result['cnt'] = $gdb->raw_delete($sql)) == 0)
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

   global $u, $gdb;
   $uid = $u->uid();
   $ident = myres($_REQUEST['ident']);

   $sql = sprintf('SELECT COUNT(*) AS cnt FROM drafts WHERE userid=%d AND draft_ident="%s"',
                    $uid, $ident);
   if ( $result['cnt'] = $gdb->trys($sql)) {
      $row = $gdb->qself('SELECT MAX(generation) AS maxgen 
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

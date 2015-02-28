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


// --- Script setup -----------------------------------------------------------

global $db;

$db = mysqli_connect('localhost', 'shj', 'Latte', 'shj');
if (!$db)
   die('Error #' . mysqli_errno() . ' connecting to Mysql-server: ' . mysqli_error());

// Newest draft generation in DB must be this number of seconds old
// before creating a new one (INSERT) instead of UPDATE'ing latest draft.
define('DRAFT_GEN_INTERVAL_SECS', 1*60);

define('DRAFT_GEN_KEEP', 100);

// Set to true to clean out old/many drafts when inserting new drafts in the table
define('DRAFT_AUTO_CLEANUP', false);

// Set this when user logs in to the web app/site or just set it to 0 and ignore userids
$myuserid = 42;


// --- Is this running from a webserver? --------------------------------------

if (empty($_POST['op'])) {   // require _POST when in prod to make hacking a bit more bothersome
   if (false)
      die("This seems not to be legit interfacing");
   
   // Run simple test when script is invoked from the shell
   $_REQUEST['ident'] = 'Unit test!';     // Common to all the _json funcs

   echo "*** SAVE ***\n";
   $_REQUEST['data'] = "Sample draft data";
   save_draft_json($myuserid);

   echo "\n\n*** GENLIST ***\n";
   genlist_json($myuserid);

   echo "\n\n*** LOAD ***\n";
   $_REQUEST['genno'] = 1;
   load_draft_json($myuserid);

   echo "\n\n*** DEATH ***\n";
   killall_json($myuserid);

   exit(0);
}

if (php_sapi_name()==="cli")
   die("Welcome to the wonderfull world of HTML5, AJAX and JSON!\nNow go test this code on a webpage.");


// --- Main -------------------------------------------------------------------

switch ($_REQUEST['op']) {
   case 'save':
      save_draft_json($myuserid);
      break;
   case 'genlist':
      genlist_json($myuserid);
      break;
   case 'load':
      load_draft_json($myuserid);
      break;
   case 'wipe':
      killall_json($myuserid);
      break;
   default:
      die("Illicit behavior detected");
} //switch op

exit(0);


// ----------------------------------------------------------------------------
// MySQL glue functions
// todo use the oo mysqli interface

function qsel($sql, $expected_rows = 1) {

   global $db;

   $res = mysqli_query($db, $sql);
   if (! $res)
      die("mysql qsel() fails");

   $nrows = $res->num_rows;
   if ($nrows < $expected_rows)
      $this->fatal_result($sql, "No row(s) returned");

   if ($nrows <= 0)
      return NULL;

   $row = mysqli_fetch_assoc($res);
   if (empty($row))
      die("qsel(): error fetching row");

   // return scalar if single column select, else return assoc array
   if (sizeof($row) == 1)
      return reset($row);        // value of $row[0]
   else
      return $row;

} //qsel

// As qsel(), but accept sprintf() format and args
function qself($sql, $args) {
    return qsel(vsprintf($sql, $args));
}

// Returns NULL when no rows are selected
function trys($sql) {
   return qsel($sql, 0);
}

function trysf($sql, $args) {
    return trys(vsprintf($sql, $args));
}

function myres($string) {
   global $db;
   return mysqli_real_escape_string($db, $string);
}

// ----------------------------------------------------------------------------

// POST inputs:
//   ident => drafts.draft_ident
//   data => text to save

// Save draft text to db, creating a new generation of the draft if the
// previous save was created more than DRAFT_GEN_INTERVAL_SECS ago.
function save_draft_json($userid) {

   global $db;
   $draft_ident = $_REQUEST['ident'];
   $data = utf8_decode($_REQUEST['data']);

   $where = sprintf('
       WHERE userid=%d 
         AND draft_ident="%s"
      ', $userid, myres($draft_ident));

   // Does draft exist already?
   $row = trys('SELECT draftid,
                             generation,
                             UNIX_TIMESTAMP(NOW()) - UNIX_TIMESTAMP(create_time) AS age_in_secs
                        FROM drafty_drafts '.$where.'
                       ORDER BY generation DESC LIMIT 1');

//var_dump($row);

   if ($row['draftid'] && $row['age_in_secs'] < DRAFT_GEN_INTERVAL_SECS) {
      $draftid = $row['draftid'];
      $sql = sprintf('UPDATE drafty_drafts
                         SET save_time = NOW(),
                             draft_data = "%s"
                       WHERE draftid="%s"',
                     myres($data), myres($draftid));
      if (!mysqli_query($db, $sql))
         die("Mysql update error: $sql");
   } else {
      // Create new draft generation as none exists or the newest gen is too old
      $sql = sprintf('INSERT INTO drafty_drafts
                        (userid, draft_ident, create_time, save_time, generation, draft_data)
                        VALUES (%d, "%s", NOW(), NOW(), %d, "%s")',
                     $userid, myres($draft_ident), $row['generation'] + 1, myres($data));
      if (!mysqli_query($db, $sql))
         die("Mysql insert error");
      $draftid = mysqli_insert_id($db);

   if (DRAFT_AUTO_CLEANUP) {

      // After another insert, check for old drafts and cleanup as needed
      $cnt = qsel('select count(*) from drafty_drafts'.$where);
      if ($cnt > DRAFT_GEN_KEEP)
         mysqli_query($db, 'delete from drafty_drafts '.$where.
                           ' order by generation limit '.($cnt-DRAFT_GEN_KEEP));

      // Also purge old drafts to keep the table tidy
      if (!mysqli_query($db, 'DELETE FROM DRAFTY_DRAFTS WHERE save_time < DATE_SUB(NOW(), INTERVAL 6 MONTH)'))
         die("Dated kill failed: $sql");
      }

   } //insert draft row

   $gen = qsel('SELECT MAX(generation) FROM drafty_drafts WHERE draftid='.$draftid);
// $msg = sprintf('Save successfull gen #%d af id=%d [%s]',
//                $gen, $draftid, $draft_ident);
   if (!empty($msg))
      $result['msg'] = utf8_encode($msg);
   $result['gen'] = $gen;
   echo json_encode( $result );

} // save_draft_json()


// ----------------------------------------------------------------------------
// POST inputs:
//   ident => drafts.draft_ident
//   genno => drafts.generation
function load_draft_json($userid) {

   $sql = sprintf( 'SELECT draft_data 
                      FROM drafty_drafts
                     WHERE userid=%d
                       AND draft_ident="%s"
                       AND generation=%d', 
                    $userid, 
                    myres($_REQUEST['ident']),
                    $_REQUEST['genno']);
   $kladde = trys($sql);
   if (empty($kladde))
      $msg = 'No such draft!';
   else
      //Where do all this \-junk come from?
//    $result['data'] = utf8_encode( stripslashes(str_replace('\n', "\n", $kladde)));
      $result['data'] = utf8_encode( $kladde );

   if (!empty($msg))
      $result['msg'] = utf8_encode($msg);

   echo json_encode( $result );

} // load_draft_json()


// ----------------------------------------------------------------------------

// POST inputs:
//   draft_id => drafts.draft_ident
// Returns:
// 'html' vertical <ul> with list of draft generations to be put in a <div> or <td>
// 'cnt'  Number of existing draft generations for draft_id
// 'max'  Highest existing generation for id
function genlist_json($userid) {

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
   $q = mysqli_query($db, $sql);

   if ( ! ( $row = $q->fetch_array(MYSQLI_ASSOC) ) )
      $msg = $html = "No saved drafts";
   else {
      $html = '';
      do {
         if ($row['generation'] > $result['max'])
            $result['max'] = $row['generation'];
         $html .= sprintf('<a class="drafty-link" href="javascript:drafty_restore_genno(%d, \'%s\');">%s</a><br>',
                          $row['generation'], $draft_ident, $row['save_time']);
      } while ( $row = $q->fetch_array(MYSQLI_ASSOC) );
   }

   $result['cnt'] = mysqli_num_rows($q);
   if (!empty($msg))
      $result['msg']  = utf8_encode($msg);
   if (!empty($html))
      $result['html'] = utf8_encode($html);
   echo json_encode( $result );

} // genlist_json()


// ----------------------------------------------------------------------------

// POST inputs:
//   draft_id => drafts.draft_ident
// Returns cnt with number of drafts removed
// 'msg' is set for errors
function killall_json($userid) {

   global $db;
   $draft_ident = $_REQUEST['ident'];

   $sql = sprintf('
      DELETE
        FROM drafty_drafts 
       WHERE userid=%d 
         AND draft_ident="%s"
      ', $userid, myres($draft_ident));

   if (!mysqli_query($db, $sql))
      die("Delete query fails");
   if (($result['cnt'] = $db->affected_rows) == 0)
      $msg = 'Ingen kladder fundet for '.$draft_ident;

   if ( ! empty($msg) )
      $result['msg']  = utf8_encode($msg);
   echo json_encode( $result );

} // killall_json()


// ----------------------------------------------------------------------------
// POST inputs:
//   ident => drafts.draft_ident
// Returns 'cnt' with number of existing draft generations.
// 'maxgen' are only set if any draft(s) are found.

// todo just return maxgen? also return timestamp for latest draft?
/**** unused
function count_drafts_json() {

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

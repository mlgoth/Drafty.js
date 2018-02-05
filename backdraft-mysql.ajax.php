<?php
// ----------------------------------------------------------------------------
//
// backdraft.ajax.php - Sample AJAX backend in php for drafty.js
// @author 11-Feb-2015/shj
//
//
// TODO
// ----
//  - Support UTF-8. It may be supported already, not tetsed.
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

global $db, $tablename;

// Create this from a copy of the -dist file and edit
require_once('mysql-setup.php');
if (!$db)
   die('Error connecting to Mysql-server');

// Newest draft generation in DB must be this number of seconds old
// before creating a new one (INSERT) instead of UPDATE'ing latest draft.
// todo: this should be configurable by webapp/coder
define('DRAFT_GEN_INTERVAL_SECS', 1*60);

// Set to true to clean out old/many drafts when inserting new drafts in the table
define('DRAFT_AUTO_CLEANUP', false);

// Draft generations to keep per draft_ident/userid when cleaning up
define('DRAFT_GEN_KEEP', 25);


// --- Is this even running from a webserver? ---------------------------------

if (php_sapi_name()==="cli") {
   
   // Run simple functionality tests when script is invoked from the shell
   $_REQUEST['ident'] = 'Backend unit test!';     // Common to all the _json funcs
   $myuserid = 42;

   echo "*** SAVE ***\n";
   $_REQUEST['data'] = "Sample draft data";
   save_draft_json($myuserid);
   $_REQUEST['data'] = "v2 data";
   save_draft_json($myuserid);
   echo "\n... sleeping for ", DRAFT_GEN_INTERVAL_SECS, " seconds ...";
   sleep(DRAFT_GEN_INTERVAL_SECS);
   echo "\n";
   $_REQUEST['data'] = "Third draft save should create a new generation";
   save_draft_json($myuserid);

   echo "\n\n*** GENLIST ***\n";
   genlist_json($myuserid);

   echo "\n\n*** LOAD ***\n";
   $_REQUEST['genno'] = 1;
   load_draft_json($myuserid);

   echo "\n\n*** DEATH ***\n";
   killall_json($myuserid);

   die("\n\nWelcome to the wonderfull world of HTML5, AJAX and JSON!\nNow go test this code on a webpage.");
}

// Code handles both GET and POST, but we require _POST when in prod to make hacking a bit more bothersome
if (empty($_POST['op']))
   die("Thou shall post");


// Security note:
//
// In a real-world scenario, you would want to verify here that
// the userid in the POST request is the same user as is logged into the
// website (often stored as a cookie).
//
// This demo code happily assumes that nobody can whack up a fake POST request
// to mess with other peoples drafts or your database.

$myuserid = $_REQUEST['uid'];


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
      die("Illicit behavior detected");      //no nice json error is returned here (purposely)
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

// As qsel(), but accept printf() format and args
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
   return $db->escape_string($string);
}


// ----------------------------------------------------------------------------
// Save draft text to db, creating a new generation of the draft if the
// previous save was created more than DRAFT_GEN_INTERVAL_SECS ago.
//
// Optionally returns 'glhtml' with fresh HTML for the genlist - same html
// output as genlist_json() to save an extra AJAX call.
//
// Additional POST inputs:
//   data => text to save

function save_draft_json($userid) {

   global $db, $tablename;
   $draft_ident = $_REQUEST['ident'];
   $data = utf8_decode($_REQUEST['data']);

   $where = sprintf('
       WHERE userid="%s"
         AND draft_ident="%s"
      ', myres($userid), myres($draft_ident));

   // Does draft exist already?
   $row = trys('SELECT draftid,
                             generation,
                             UNIX_TIMESTAMP(NOW()) - UNIX_TIMESTAMP(create_time) AS age_in_secs
                        FROM '.$tablename.' '.$where.'
                       ORDER BY generation DESC LIMIT 1');

   if ($row['draftid'] && $row['age_in_secs'] < DRAFT_GEN_INTERVAL_SECS) {
      $draftid = $row['draftid'];
      $sql = sprintf('UPDATE '.$tablename.'
                         SET save_time = NOW(),
                             draft_data = "%s"
                       WHERE draftid="%s"',
                     myres($data), myres($draftid));
      if (!mysqli_query($db, $sql))
         die("Mysql update error: $sql");
   } else {
      // Create new draft generation as none exists or the newest gen is too old
      $sql = sprintf('INSERT INTO '.$tablename.'
                        (userid, draft_ident, create_time, save_time, generation, draft_data)
                        VALUES ("%s", "%s", NOW(), NOW(), %d, "%s")',
                     myres($userid), myres($draft_ident), $row['generation'] + 1, myres($data));
      if (!mysqli_query($db, $sql))
         die("Mysql insert error");
      $draftid = mysqli_insert_id($db);

      // After another insert, check for old drafts and cleanup as needed
      if (DRAFT_AUTO_CLEANUP) {

         $cnt = qsel('select count(*) from '.$tablename.$where);
         if ($cnt > DRAFT_GEN_KEEP)
            mysqli_query($db, 'delete from '.$tablename.$where.
                              ' order by generation limit '.($cnt-DRAFT_GEN_KEEP));

         // Also purge old drafts to keep the table tidy
         // todo interval should be a defined param
         if (!mysqli_query($db, 'DELETE FROM '.$tablename.' WHERE save_time < DATE_SUB(NOW(), INTERVAL 6 MONTH)'))
            die("Dated kill failed: $sql");
      }

   } //insert draft row

   $gen = qsel('SELECT MAX(generation) FROM '.$tablename.' WHERE draftid='.$draftid);
   if (!empty($msg))
      $result['msg'] = utf8_encode($msg);
   $result['gen'] = $gen;
   echo json_encode( $result );

} // save_draft_json()


// ----------------------------------------------------------------------------
// Additional POST inputs:
//   genno => drafts.generation
function load_draft_json($userid) {

   global $tablename;

   $sql = sprintf( 'SELECT draft_data 
                      FROM '.$tablename.'
                     WHERE userid="%s"
                       AND draft_ident="%s"
                       AND generation=%d', 
                    myres($userid), 
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

// Returns:
// 'html' vertical <ul> with list of draft generations to be put in a <div> or <td>
// 'cnt'  Number of existing draft generations for draft_id
// 'max'  Highest existing generation for id
// todo: don't hardcode drafty_restore_genno calls
function genlist_json($userid) {

   global $db, $tablename;
   $draft_ident = $_REQUEST['ident'];

   $sql = sprintf('
      SELECT *, TIME(save_time) 
        FROM %s 
       WHERE userid="%s"
         AND draft_ident="%s"
       ORDER BY save_time DESC
      ', $tablename, myres($userid), myres($draft_ident));

   $q = mysqli_query($db, $sql);
   $result = array('max' => 0, 'cnt' => mysqli_num_rows($q));

   if ( ! ( $row = $q->fetch_array(MYSQLI_ASSOC) ) )
      $msg = $html = "No saved drafts";
   else {
      $html = '';
      do {
         if ($row['generation'] > $result['max'])
            $result['max'] = $row['generation'];
         $html .= sprintf('<a class="drafty-link" href="javascript:drafty_restore_genno(%d, \'%s\');" title="%s">%s</a><br>',
                          $row['generation'], $draft_ident, "Data:".htmlspecialchars($row['draft_data']), $row['save_time']);
      } while ( $row = $q->fetch_array(MYSQLI_ASSOC) );
   }

   if (!empty($msg))
      $result['msg']  = utf8_encode($msg);
   if (!empty($html))
      $result['html'] = utf8_encode($html);
   echo json_encode( $result );

} // genlist_json()


// ----------------------------------------------------------------------------

// Returns 'cnt' with number of drafts removed
function killall_json($userid) {

   global $db, $tablename;
   $draft_ident = $_REQUEST['ident'];

   $sql = sprintf('
      DELETE FROM %s 
       WHERE userid="%s"
         AND draft_ident="%s"
      ', $tablename, myres($userid), myres($draft_ident));

   if (!mysqli_query($db, $sql))
      die("Delete query fails");
   if (($result['cnt'] = $db->affected_rows) == 0)
      $msg = 'No draft versions found for '.$draft_ident;

   if ( ! empty($msg) )
      $result['msg']  = utf8_encode($msg);
   echo json_encode( $result );

} // killall_json()


// ----------------------------------------------------------------------------
// $Id: backdraft.ajax.php 2092 2015-02-22 18:48:20Z shj $
// vim:aw:
// ----------------------------------------------------------------------------
?>

-- Drafty.js/table-drafts.sql
-- Sample drafts table for a MySQL database.

-- DROP TABLE IF EXISTS drafty_drafts;

CREATE TABLE drafty_drafts (

   draftid        INT AUTO_INCREMENT PRIMARY KEY,

   userid         INT(11) NOT NULL COMMENT "Owner of this draft, usually users.userid",
   draft_ident    VARCHAR(20) NOT NULL COMMENT "Unique ID of this particular draft - pagename, html id, whatever",
   generation     SMALLINT UNSIGNED NOT NULL DEFAULT 1,

   save_time      TIMESTAMP NOT NULL ON UPDATE CURRENT_TIMESTAMP,
   create_time    TIMESTAMP NOT NULL, -- only one col can use DEFAULT CURRENT_TIMESTAMP, silly MySQL

   draft_data     TEXT NOT NULL,

   UNIQUE KEY (draft_ident, generation, userid),
   KEY (create_time)

);


-- $Id$
-- vim:aw:

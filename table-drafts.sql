-- Sample MySQL drafts table for Drafty.js
-- Nov-2013/shj

DROP table IF EXISTS drafty_drafts;

CREATE TABLE drafty_drafts (

   -- Automatic stuff
   draftid        INT        AUTO_INCREMENT PRIMARY KEY,
   save_time      TIMESTAMP  NOT NULL                    COMMENT "When draft_data was last updated",
   create_time    TIMESTAMP  DEFAULT NOW() NOT NULL      COMMENT "Row insertion time",

   -- Identifying stuff
   draft_ident    VARCHAR(42)       NOT NULL             COMMENT "Unique identifier for draft, often the HTML id for input field",
   generation     INT(6) UNSIGNED   NOT NULL DEFAULT 1   COMMENT "A million minus one should be enough revisions for everyone",
   userid         VARCHAR(42)       NOT NULL             COMMENT "users.userid OWNZ this draft",

   -- Data!
   draft_data     TEXT              NOT NULL             COMMENT "Saved draft text from the HTML input field",

   -- Explicit keys
   UNIQUE KEY (draft_ident, generation, userid),
   KEY (create_time),
   KEY (save_time)

   -- todo KEY generation and userid - or are they automatically keyed by the UNIQUE KEY declaration?

) DEFAULT CHARSET=latin1;

-- $Id$
-- vim:aw:

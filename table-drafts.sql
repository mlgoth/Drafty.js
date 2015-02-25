-- drafts table, Nov-2013/shj

DROP table IF EXISTS drafts;

CREATE TABLE drafts (

   -- Automatic stuff
   draftid        INT AUTO_INCREMENT PRIMARY KEY COMMENT "Uniquely identifies this draft generation amongst millions",
   create_time    TIMESTAMP         NOT NULL             COMMENT "The exact insertion time",
   save_time      TIMESTAMP         NOT NULL             COMMENT "When draft_data was last updated",

   -- Identifying stuff
   draft_ident    VARCHAR(42)       NOT NULL             COMMENT "Unique identifier for draft, possibly the HTML id for input field",
   generation     INT(6) UNSIGNED   NOT NULL DEFAULT 1   COMMENT "A million minus one should be enough revisions for anyone",
   userid         INT(11)           NOT NULL             COMMENT "users.userid OWNZ this draft",

   -- Data!
   draft_data     TEXT              NOT NULL             COMMENT "The meat of this table - the actual saved draft text from the HTML input field",

   -- Explicit keys
   UNIQUE KEY (draft_ident, generation, userid),
   KEY (create_time),
   KEY (save_time)

   -- todo KEY generation and userid - or are they automatically keyed by the UNIQUE KEY declaration?

) DEFAULT CHARSET=latin1;

-- vim:aw:

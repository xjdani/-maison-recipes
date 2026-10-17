-- Stores image author, license, and source for photographs discovered on Wikimedia Commons.
-- Existing images and imported recipe images remain unchanged.
ALTER TABLE recipes ADD COLUMN image_credit TEXT NOT NULL DEFAULT '';

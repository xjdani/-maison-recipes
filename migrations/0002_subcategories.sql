-- Hierarchical recipe taxonomy. Existing recipes are assigned without changing other fields.
ALTER TABLE recipes ADD COLUMN subcategory TEXT NOT NULL DEFAULT '';
UPDATE recipes SET subcategory = CASE
 WHEN category = 'Desi Food' AND (lower(title) LIKE '%biryani%' OR lower(title) LIKE '%pulao%') THEN 'Rice'
 WHEN category = 'Desi Food' AND (lower(title) LIKE '%tikka%' OR lower(title) LIKE '%kebab%') THEN 'BBQ'
 WHEN category = 'Desi Food' AND (lower(title) LIKE '%kheer%' OR lower(title) LIKE '%halwa%') THEN 'Desserts'
 WHEN category = 'Desi Food' AND (lower(title) LIKE '%daal%' OR lower(title) LIKE '%aloo%' OR lower(title) LIKE '%saag%') THEN 'Vegetables'
 WHEN category = 'Desi Food' THEN 'Meat'
 WHEN category = 'Fast Food' AND lower(title) LIKE '%pizza%' THEN 'Pizza'
 WHEN category = 'Fast Food' AND (lower(title) LIKE '%shawarma%' OR lower(title) LIKE '%wrap%') THEN 'Wraps & Shawarma'
 WHEN category = 'Fast Food' AND lower(title) LIKE '%sandwich%' THEN 'Sandwiches'
 WHEN category = 'Fast Food' AND lower(title) LIKE '%fries%' THEN 'Sides & Snacks'
 WHEN category = 'Fast Food' THEN 'Burgers'
 WHEN category = 'Foreign Food' AND (lower(title) LIKE '%pasta%' OR lower(title) LIKE '%spaghetti%') THEN 'Pasta'
 WHEN category = 'Foreign Food' AND lower(title) LIKE '%lasagna%' THEN 'Baked Dishes'
 WHEN category = 'Foreign Food' AND lower(title) LIKE '%rice%' THEN 'Rice & Noodles'
 WHEN category = 'Foreign Food' AND lower(title) LIKE '%shrimp%' THEN 'Seafood'
 WHEN category = 'Foreign Food' THEN 'Breakfast & Brunch'
 ELSE '' END WHERE subcategory = '';

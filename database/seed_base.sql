-- Base lookup data: food categories and allergens.

INSERT INTO food_categories (name) VALUES
  ('fruits'), ('vegetables'), ('meat'), ('poultry'), ('fish'), ('eggs'), ('dairy'),
  ('grains'), ('legumes'), ('nuts & seeds'), ('fats & oils'), ('snacks'), ('sweets'),
  ('drinks'), ('dishes'), ('soups & sauces'), ('spices & herbs'), ('other');

-- The 9 most common food allergens.
INSERT INTO allergens (name) VALUES
  ('gluten'), ('dairy'), ('egg'), ('peanut'), ('tree nut'),
  ('soy'), ('fish'), ('shellfish'), ('sesame');

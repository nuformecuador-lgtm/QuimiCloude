CREATE INDEX "recipes_name_normalized_all_trgm_idx"
  ON "recipes" USING gin ("name_normalized" gin_trgm_ops);

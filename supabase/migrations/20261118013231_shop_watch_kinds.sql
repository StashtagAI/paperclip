-- HAN-84: two more fixed top-level kinds for saves that aren't food, places, recipes or activities.
--   shop  : products to buy (fragrance, skincare, clothes, gadgets)
--   watch : shows, films, books, podcasts ("Watch & read")
alter type public.list_kind add value if not exists 'shop';
alter type public.list_kind add value if not exists 'watch';

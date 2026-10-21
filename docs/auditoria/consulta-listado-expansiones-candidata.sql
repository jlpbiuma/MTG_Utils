-- Prototype for read-only EXPLAIN. Not a migration or a production replacement.
WITH matches AS (
          SELECT p.id AS printing_id,c.quantity,c.is_foil FROM user_collections c JOIN card_printings p ON p.id=c.card_scryfall_id WHERE c.user_id=$1
          UNION ALL
          SELECT p.id,c.quantity,c.is_foil FROM user_collections c
          JOIN card_sets s ON lower(s.code)=lower(c.set_code)
          JOIN card_printings p ON p.set_id=s.id AND lower(p.collector_number)=lower(c.collector_number)
          WHERE c.user_id=$1 AND NOT EXISTS(SELECT 1 FROM card_printings exact WHERE exact.id=c.card_scryfall_id)
        ), resolved_owned AS (
          SELECT printing_id,SUM(quantity)::int AS quantity,
            SUM(quantity) FILTER(WHERE NOT is_foil)::int AS normal_quantity,
            SUM(quantity) FILTER(WHERE is_foil)::int AS foil_quantity FROM matches GROUP BY printing_id
        )
                SELECT s.code,
                       COUNT(p.id)::int AS "cardCount",
                       COUNT(p.id) FILTER(WHERE COALESCE(p.price_cardmarket_trend,p.price_eur,0)>0)::int AS "pricedCount",
                       COUNT(p.id) FILTER (WHERE COALESCE(owned.quantity, 0) > 0)::int AS "ownedCount",
                       COALESCE(SUM(COALESCE(p.price_cardmarket_trend, p.price_eur, 0)), 0)::float AS "totalValueEur",
                       COALESCE(SUM((COALESCE(p.price_cardmarket_trend, p.price_eur, 0) * COALESCE(owned.normal_quantity, 0) + COALESCE(p.price_eur_foil, 0) * COALESCE(owned.foil_quantity, 0))), 0)::float AS "ownedValueEur",
                       COALESCE(SUM(CASE WHEN COALESCE(owned.quantity, 0) = 0
                           THEN COALESCE(p.price_cardmarket_trend, p.price_eur, 0) ELSE 0 END), 0)::float AS "missingValueEur"
                FROM card_sets s
                LEFT JOIN card_printings p ON p.set_id = s.id
                LEFT JOIN resolved_owned owned ON owned.printing_id = p.id
                GROUP BY s.code

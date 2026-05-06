# POS System — Architecture Decisions

---

## 1. we will use zustend

## 2. we will store cart in memory with sqlite

## 3. we will use revision intead timestamp for the syncing

## 4. we will use hybrid approach on statup app

## 5. we will use the indexing map for the product search

## 6. we will use the revision number approach for WebSocket missed-message recovery

## 7. price and tax should be calculated only on frontend

## 8. we will use sqlite for persist data and memory for tempory data

## 9. we will get the image url which we want to show on the ui only

## 10. Cart operations, refunds, discounts, price overrides, and manual weight entry should not be simple UI actions only. They need permission checks.

## 11. The hybrid SQLite + React memory approach is the best direction for this POS

## 12. we will use wal for offline mode and use for payment and order validate

## 13. sync serialized or not (doubt)

## 14. if are fetching the product from the sqlite then we will show the last syncing on the ui

## 15. we will update the in the both memory and sqlite both

## 16. Product removed from backend -> mark inactive/unavailable, do not hard-delete immediately

## 17. we will add the interval When background sync fails

## 18. squlite clean up

## 19. offline orde sync

## 20. session id generation

## 21. websocket reconnetion internqqlly

## 22. ota update dns

## 23. error handling

## 24. crash reporting

## 25. grpc restfull websocket or sse

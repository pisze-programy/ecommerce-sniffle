# Merchradar: decyzja o sledzeniu sklepow

Zrodlo: merchradar.pl API (173 tworcow, 98 unikalnych sklepow).
Decyzja: TAK = mamy dzialajacy provider. MOZE = stan jest w HTML, wymaga custom web providera. NIE = brak dostepu do stanu / martwy / zablokowany.
Proxy: szacunek MB na run (webshare).

TAK: 63 | MOZE: 4 | NIE: 31 | razem: 98

## TAK (gotowe do integracji)

| sklep                 | platforma  | produkty | proxy MB/run | why                           |
| --------------------- | ---------- | -------: | -----------: | ----------------------------- |
| sprecords.pl          | prestashop |      531 |         2.66 | cart-reveal (mutation)        |
| wojanshop.pl          | shopify    |      383 |         0.27 | mcp-inventory (dokladny stan) |
| merchit.pl            | shopify    |      308 |         0.22 | mcp-inventory (dokladny stan) |
| sanah.shop            | shopify    |      302 |         0.21 | mcp-inventory (dokladny stan) |
| csrpk.pl              | prestashop |      294 |         1.47 | cart-reveal (mutation)        |
| palionstyle.pl        | shoper     |      146 |         0.88 | basket-reveal (mutation)      |
| hempszop.pl           | prestashop |      143 |         0.71 | cart-reveal (mutation)        |
| gugushop.pl           | shopify    |      125 |         0.09 | mcp-inventory (dokladny stan) |
| vulgarus.pl           | shoper     |      122 |         0.73 | basket-reveal (mutation)      |
| dopehouse.pl          | shoper     |       87 |         0.52 | basket-reveal (mutation)      |
| sklepladypank.pl      | shoper     |       85 |         0.51 | basket-reveal (mutation)      |
| luczekshop.pl         | shoper     |       84 |         0.50 | basket-reveal (mutation)      |
| sbmstore.pl           | shoper     |       83 |         0.50 | basket-reveal (mutation)      |
| risky.pl              | shoper     |       76 |         0.46 | basket-reveal (mutation)      |
| moontale.pl           | prestashop |       65 |         0.33 | cart-reveal (mutation)        |
| zenonmartyniuk.pl     | prestashop |       53 |         0.27 | cart-reveal (mutation)        |
| wrrrah.myshopify.com  | shopify    |       49 |         0.03 | mcp-inventory (dokladny stan) |
| zerosklep.pl          | prestashop |       48 |         0.24 | cart-reveal (mutation)        |
| crankall.com          | shopify    |       39 |         0.03 | mcp-inventory (dokladny stan) |
| friendzstore.pl       | shopify    |       38 |         0.03 | mcp-inventory (dokladny stan) |
| 33mata.pl             | shopify    |       33 |         0.02 | mcp-inventory (dokladny stan) |
| musicdrop.pl          | shopify    |       32 |         0.02 | mcp-inventory (dokladny stan) |
| store.wojteksokol.com | shopify    |       32 |         0.02 | mcp-inventory (dokladny stan) |
| papitoenergy.com      | shopify    |       30 |         0.02 | mcp-inventory (dokladny stan) |
| mualasklep.pl         | shopify    |       29 |         0.02 | mcp-inventory (dokladny stan) |
| tacohemingway.store   | shopify    |       28 |         0.02 | mcp-inventory (dokladny stan) |
| kokafeat.com          | shoper     |       24 |         0.14 | basket-reveal (mutation)      |
| drstyle.pl            | prestashop |       24 |         0.12 | cart-reveal (mutation)        |
| jwpcrew.pl            | prestashop |       24 |         0.12 | cart-reveal (mutation)        |
| znosne.pl             | shopify    |       21 |         0.01 | mcp-inventory (dokladny stan) |
| berecords.pl          | shopify    |       21 |         0.01 | mcp-inventory (dokladny stan) |
| queshop.pl            | shoper     |       19 |         0.11 | basket-reveal (mutation)      |
| zalezy.pl             | shoper     |       19 |         0.11 | basket-reveal (mutation)      |
| nnjl.pl               | shopify    |       17 |         0.01 | mcp-inventory (dokladny stan) |
| musielismy.com        | shopify    |       16 |         0.01 | mcp-inventory (dokladny stan) |
| zalia.store           | shopify    |       13 |         0.01 | mcp-inventory (dokladny stan) |
| 474747.pl             | shopify    |       12 |         0.01 | mcp-inventory (dokladny stan) |
| islandrecords.pl      | shopify    |       12 |         0.01 | mcp-inventory (dokladny stan) |
| polskawersja.pl       | shoper     |       12 |         0.07 | basket-reveal (mutation)      |
| brokies.store         | shoper     |       12 |         0.07 | basket-reveal (mutation)      |
| californiarecords.pl  | shopify    |       11 |         0.01 | mcp-inventory (dokladny stan) |
| hhsklep.pl            | shoper     |       11 |         0.07 | Shoper; webapi dziala         |
| tilt.pl               | shopify    |       11 |         0.01 | mcp-inventory (dokladny stan) |
| akash.pl              | shoper     |        9 |         0.05 | basket-reveal (mutation)      |
| pezet.store           | shopify    |        8 |         0.01 | mcp-inventory (dokladny stan) |
| store.thetribbe.com   | prestashop |        8 |         0.04 | cart-reveal (mutation)        |
| chivasio.shop         | shopify    |        7 |         0.00 | mcp-inventory (dokladny stan) |
| internaziomale.com.pl | shopify    |        6 |         0.00 | mcp-inventory (dokladny stan) |
| restaurantposse.pl    | shopify    |        6 |         0.00 | mcp-inventory (dokladny stan) |
| sklepgtbt.com         | shopify    |        6 |         0.00 | mcp-inventory (dokladny stan) |
| nowaplyta.pl          | shoper     |        5 |         0.03 | basket-reveal (mutation)      |
| maxflosklep.pl        | shoper     |        5 |         0.03 | basket-reveal (mutation)      |
| wegorz.sklep.pl       | shopify    |        4 |         0.00 | mcp-inventory (dokladny stan) |
| sklep.2115.pl         | shopify    |        3 |         0.00 | mcp-inventory (dokladny stan) |
| reklamacja47.com      | shopify    |        3 |         0.00 | mcp-inventory (dokladny stan) |
| sklep.yfl.pl          | shopify    |        3 |         0.00 | mcp-inventory (dokladny stan) |
| riott.eu              | shopify    |        3 |         0.00 | mcp-inventory (dokladny stan) |
| preorder.pl           | shoper     |        3 |         0.02 | basket-reveal (mutation)      |
| polskiswag.pl         | shopify    |        3 |         0.00 | mcp-inventory (dokladny stan) |

| mur.global | shopify | 3 | 0.00 | mcp-inventory (dokladny stan) |
| 9ssey.com | shoper | 2 | 0.01 | basket-reveal (mutation) |

## MOZE (custom provider, stan w HTML)

| sklep         | platforma | produkty | proxy MB/run | why                                   |
| ------------- | --------- | -------: | -----------: | ------------------------------------- |
| asfaltshop.pl | custom    |       81 |            0 | custom newshop; stan niezweryfikowany |
| 303.com.pl    | sky-shop  |       14 |            0 | Sky-Shop; stan w JSON produktu        |
| teamkaluch.pl | sky-shop  |       58 |            0 | Sky-Shop; data-stocks w HTML produktu |
| winylownia.pl | shopware  |       10 |            0 | Shopware; quantity w JSON produktu    |

## NIE

| sklep          | platforma   | produkty | status | why                                   |
| -------------- | ----------- | -------: | -----: | ------------------------------------- |
| empik.com      | marketplace |     1024 |    200 | marketplace Empik                     |
| 7more7.com     | cloudflare  |      483 |    403 | zablokowany przez Cloudflare (403)    |
| pihszou.pl     | woocommerce |       88 |    200 | WooCommerce; brak stanu               |
| ekipatonosi.pl | magento     |       70 |    200 | Magento; tylko availability, brak qty |
| narkopop.store | woocommerce |       44 |    200 | WooCommerce; brak stanu               |
| defjam.pl      | custom      |       41 |    503 | niepewne; brak endpointu stanu        |

| pro8l3m.pl | woocommerce | 33 | 200 | WooCommerce; brak stanu |
| tsquad.pl | woocommerce | 32 | 200 | WooCommerce; brak stanu |
| polskirap.co | woocommerce | 29 | 200 | WooCommerce; brak stanu |
| pozdrawiam.net | woocommerce | 23 | 200 | WooCommerce; brak stanu |

| hasztasz.pl | custom | 19 | 200 | custom; brak stanu w HTML |
| thunderwear.pl | cloudflare | 16 | 403 | zablokowany przez Cloudflare (403) |
| antihype.pl | dead | 16 | 503 | strona w budowie (503) |

| horrecsklep.pl | cloudflare | 15 | 200 | zablokowany przez Cloudflare |

| babiczecroydon.com | woocommerce | 14 | 200 | WooCommerce; brak stanu |
| czucpiniadz.pl | woocommerce | 14 | 200 | WooCommerce; brak stanu |
| ojsklep.pl | woocommerce | 12 | 200 | WooCommerce; brak stanu |
| aurashop.pl | wordpress | 11 | 200 | WordPress; brak sklepu/stanu |
| kingsento.pl | woocommerce | 7 | 200 | WooCommerce; brak stanu |
| juliawieniawa.store | dead | 7 | 503 | niedostepny (503) |
| tubungee.pl | woocommerce | 6 | 200 | WooCommerce; brak stanu |
| hecato.pl | woocommerce | 6 | 200 | WooCommerce; brak stanu |
| ogolgierd.pl | dead | 5 | 503 | niedostepny (503) |
| dobziludzie.com | woocommerce | 5 | 200 | WooCommerce; brak stanu |
| fagata.com | blocked | 4 | 402 | sklep niedostepny (402) |
| takierzeczy.com | woocommerce | 4 | 200 | WooCommerce; brak stanu |
| profeat.bigcartel.com | bigcartel | 4 | 200 | brak stanu w publicznym API |
| przedwczorajdzisiajpojutrze.pl | custom | 4 | 200 | custom SPA; stan niezweryfikowany |
| fishntits.pl | dead | 3 | 503 | niedostepny (503) |
| patologistic.pl | woocommerce | 2 | 200 | WooCommerce; brak stanu |
| sklep.dawidpodsiadlo.pl | dead | 1 | 0 | brak odpowiedzi |

## Podsumowanie

Proxy na run dla wszystkich TAK: ~14.6 MB (2x dziennie = ~29.3 MB).
Najwieksze koszty proxy: shoper ~0.006 MB/produkt, prestashop ~0.005 MB/produkt, shopify ~0.0007 MB/produkt.

# Verification against PBS's own printed figures

Checked 352 weekly reports (2019-09-05 → 2026-10-08), 51 items each. Our pipeline computes every change itself; PBS prints its own previous-week, same-week-last-year and % change figures next to the national average, so the two are independent.

Tolerance: Rs 0.01 for prices, 0.01 percentage points for % changes (PBS prints 2 decimals).

| Check | Compared | Match | Mismatch | Left blank (–) | Match % |
|---|---:|---:|---:|---:|---:|
| this week's price | 17952 | 17952 | 0 | 0 | 100.0 |
| last week's price | 17901 | 17669 | 232 | 51 | 98.7 |
| weekly % change | 17901 | 17670 | 231 | 51 | 98.71 |
| price a year ago | 14586 | 14542 | 44 | 3366 | 99.7 |
| yearly % change | 14586 | 14543 | 43 | 3366 | 99.71 |

*Left blank*: we show "–" — the first year of our data (from Sep 2019) has no year earlier, and some weeks are missing from our archive; we never borrow a neighbouring week.

*Why the rest differ*: (1) PBS sometimes corrects an earlier week's figure in a later report (e.g. electricity, 27 Nov 2025: printed Rs 4.83, later quoted as Rs 5.40); we keep each week as first published. (2) When a week is missing from our archive, our "weekly" change spans two weeks, while PBS compares with the missing week.

## Mismatches

| Week | Item | Field | Ours | PBS |
|---|---|---|---:|---:|
| 2019-09-12 | petrol | last week's price | 111.84 | 114.18 |
| 2019-09-12 | petrol | weekly % change | 2.09 | 0.00 |
| 2019-09-12 | lpg | last week's price | 1223.02 | 1279.51 |
| 2019-09-12 | lpg | weekly % change | 4.49 | -0.12 |
| 2019-10-10 | diesel | last week's price | 128.11 | 128.14 |
| 2019-10-10 | diesel | weekly % change | 0.02 | 0.00 |
| 2019-11-07 | wheat_flour | last week's price | 923.53 | 924.45 |
| 2019-11-07 | wheat_flour | weekly % change | -0.78 | -0.88 |
| 2020-03-19 | wheat_flour | last week's price | 872.71 | 883.17 |
| 2020-03-19 | wheat_flour | weekly % change | 2.05 | 0.84 |
| 2020-03-19 | beef | last week's price | 434.38 | 435.90 |
| 2020-03-19 | beef | weekly % change | 0.61 | 0.26 |
| 2020-03-19 | mutton | last week's price | 897.48 | 904.40 |
| 2020-03-19 | mutton | weekly % change | 1.30 | 0.53 |
| 2020-03-19 | chicken | last week's price | 153.46 | 174.69 |
| 2020-03-19 | chicken | weekly % change | 4.79 | -7.95 |
| 2020-03-19 | milk | last week's price | 93.99 | 94.66 |
| 2020-03-19 | milk | weekly % change | 1.01 | 0.30 |
| 2020-03-19 | curd | last week's price | 108.20 | 109.72 |
| 2020-03-19 | curd | weekly % change | 1.65 | 0.25 |
| 2020-03-19 | eggs | last week's price | 94.04 | 101.74 |
| 2020-03-19 | eggs | weekly % change | 8.52 | 0.30 |
| 2020-03-19 | mustard_oil | last week's price | 220.55 | 219.31 |
| 2020-03-19 | mustard_oil | weekly % change | -1.65 | -1.10 |
| 2020-03-19 | bananas | last week's price | 87.33 | 87.20 |
| 2020-03-19 | bananas | weekly % change | -3.73 | -3.59 |
| 2020-03-19 | pulse_masoor | last week's price | 141.37 | 139.74 |
| 2020-03-19 | pulse_masoor | weekly % change | -0.72 | 0.44 |
| 2020-03-19 | pulse_moong | last week's price | 234.23 | 234.26 |
| 2020-03-19 | pulse_moong | weekly % change | -0.44 | -0.46 |
| 2020-03-19 | pulse_mash | last week's price | 224.04 | 223.42 |
| 2020-03-19 | pulse_mash | weekly % change | -0.62 | -0.34 |
| 2020-03-19 | pulse_gram | last week's price | 147.75 | 148.04 |
| 2020-03-19 | pulse_gram | weekly % change | -0.30 | -0.49 |
| 2020-03-19 | potatoes | last week's price | 40.18 | 45.29 |
| 2020-03-19 | potatoes | weekly % change | 11.67 | -0.93 |
| 2020-03-19 | onions | last week's price | 73.03 | 75.42 |
| 2020-03-19 | onions | weekly % change | -5.27 | -8.27 |
| 2020-03-19 | tomatoes | last week's price | 35.19 | 33.67 |
| 2020-03-19 | tomatoes | weekly % change | 15.40 | 20.61 |
| 2020-03-19 | sugar | last week's price | 79.83 | 80.06 |
| 2020-03-19 | sugar | weekly % change | 2.29 | 2.00 |
| 2020-03-19 | gur | last week's price | 117.99 | 117.57 |
| 2020-03-19 | gur | weekly % change | 0.82 | 1.18 |
| 2020-03-19 | garlic | last week's price | 364.75 | 356.62 |
| 2020-03-19 | garlic | weekly % change | -9.18 | -7.11 |
| 2020-03-19 | long_cloth | last week's price | 314.69 | 319.37 |
| 2020-03-19 | long_cloth | weekly % change | 1.49 | 0.00 |
| 2020-03-19 | shirting | last week's price | 206.04 | 207.77 |
| 2020-03-19 | shirting | weekly % change | 0.84 | 0.00 |
| 2020-03-19 | firewood | last week's price | 686.71 | 686.53 |
| 2020-03-19 | firewood | weekly % change | -0.03 | 0.00 |
| 2020-03-19 | lpg | last week's price | 1678.69 | 1631.27 |
| 2020-03-19 | lpg | weekly % change | 0.78 | 3.71 |
| 2020-06-18 | petrol | last week's price | 75.39 | 75.35 |
| 2020-06-18 | petrol | weekly % change | -0.05 | 0.00 |
| 2020-09-03 | petrol | price a year ago | 111.84 | 114.18 |
| 2020-09-03 | petrol | yearly % change | -6.19 | -8.11 |
| 2020-09-03 | lpg | price a year ago | 1223.02 | 1279.51 |
| 2020-09-03 | lpg | yearly % change | 4.22 | -0.38 |
| 2020-10-01 | diesel | price a year ago | 128.11 | 128.14 |
| 2020-10-01 | diesel | yearly % change | -18.01 | -18.03 |
| 2021-02-25 | long_cloth | last week's price | 366.83 | 366.28 |
| 2021-02-25 | long_cloth | weekly % change | 2.81 | 2.96 |
| 2021-05-27 | wheat_flour | last week's price | 1112.35 | 1145.84 |
| 2021-05-27 | wheat_flour | weekly % change | 2.91 | -0.10 |
| 2021-05-27 | rice_basmati | last week's price | 92.63 | 92.73 |
| 2021-05-27 | rice_basmati | weekly % change | 0.11 | 0.00 |
| 2021-05-27 | rice_irri | last week's price | 72.83 | 72.75 |
| 2021-05-27 | rice_irri | weekly % change | -0.11 | 0.00 |
| 2021-05-27 | bread | last week's price | 57.35 | 59.24 |
| 2021-05-27 | bread | weekly % change | 3.30 | 0.00 |
| 2021-05-27 | beef | last week's price | 507.46 | 517.97 |
| 2021-05-27 | beef | weekly % change | 3.56 | 1.46 |
| 2021-05-27 | mutton | last week's price | 1060.49 | 1072.98 |
| 2021-05-27 | mutton | weekly % change | 2.51 | 1.32 |
| 2021-05-27 | chicken | last week's price | 288.72 | 325.50 |
| 2021-05-27 | chicken | weekly % change | -3.60 | -14.49 |
| 2021-05-27 | milk | last week's price | 107.73 | 108.21 |
| 2021-05-27 | milk | weekly % change | 0.81 | 0.36 |
| 2021-05-27 | curd | last week's price | 125.46 | 125.67 |
| 2021-05-27 | curd | weekly % change | 0.69 | 0.53 |
| 2021-05-27 | powdered_milk | last week's price | 484.12 | 487.94 |
| 2021-05-27 | powdered_milk | weekly % change | 0.84 | 0.05 |
| 2021-05-27 | eggs | last week's price | 141.82 | 149.42 |
| 2021-05-27 | eggs | weekly % change | 4.43 | -0.88 |
| 2021-05-27 | mustard_oil | last week's price | 289.32 | 292.83 |
| 2021-05-27 | mustard_oil | weekly % change | 1.88 | 0.66 |
| 2021-05-27 | ghee_tin | last week's price | 770.23 | 771.73 |
| 2021-05-27 | ghee_tin | weekly % change | 0.19 | 0.00 |
| 2021-05-27 | bananas | last week's price | 140.71 | 156.55 |
| 2021-05-27 | bananas | weekly % change | 4.19 | -6.35 |
| 2021-05-27 | pulse_masoor | last week's price | 155.30 | 155.20 |
| 2021-05-27 | pulse_masoor | weekly % change | 2.18 | 2.25 |
| 2021-05-27 | pulse_moong | last week's price | 228.36 | 226.27 |
| 2021-05-27 | pulse_moong | weekly % change | -1.69 | -0.78 |
| 2021-05-27 | pulse_mash | last week's price | 259.13 | 259.27 |
| 2021-05-27 | pulse_mash | weekly % change | -0.52 | -0.58 |
| 2021-05-27 | pulse_gram | last week's price | 147.66 | 148.43 |
| 2021-05-27 | pulse_gram | weekly % change | 1.88 | 1.35 |
| 2021-05-27 | potatoes | weekly % change | -1.70 | -1.67 |
| 2021-05-27 | onions | last week's price | 28.55 | 30.54 |
| 2021-05-27 | onions | weekly % change | -4.38 | -10.61 |
| 2021-05-27 | tomatoes | last week's price | 31.80 | 26.09 |
| 2021-05-27 | tomatoes | weekly % change | -15.69 | 2.76 |
| 2021-05-27 | sugar | last week's price | 96.00 | 99.22 |
| 2021-05-27 | sugar | weekly % change | 2.65 | -0.69 |
| 2021-05-27 | gur | last week's price | 127.82 | 128.96 |
| 2021-05-27 | gur | weekly % change | 2.59 | 1.68 |
| 2021-05-27 | garlic | last week's price | 170.66 | 172.89 |
| 2021-05-27 | garlic | weekly % change | -1.80 | -3.07 |
| 2021-05-27 | cooked_beef | last week's price | 155.52 | 157.58 |
| 2021-05-27 | cooked_beef | weekly % change | 1.32 | 0.00 |
| 2021-05-27 | cooked_daal | last week's price | 78.26 | 78.67 |
| 2021-05-27 | cooked_daal | weekly % change | 0.52 | 0.00 |
| 2021-05-27 | tea_cup | last week's price | 29.00 | 29.23 |
| 2021-05-27 | tea_cup | weekly % change | 0.79 | 0.00 |
| 2021-05-27 | electricity | last week's price | 6.18 | 5.98 |
| 2021-05-27 | electricity | weekly % change | -3.24 | 0.00 |
| 2021-05-27 | firewood | last week's price | 732.34 | 734.19 |
| 2021-05-27 | firewood | weekly % change | 0.25 | 0.00 |
| 2021-05-27 | matchbox | last week's price | 3.34 | 3.37 |
| 2021-05-27 | matchbox | weekly % change | 0.90 | 0.00 |
| 2021-05-27 | lpg | last week's price | 1245.87 | 1242.57 |
| 2021-05-27 | lpg | weekly % change | 3.09 | 3.36 |
| 2021-05-27 | toilet_soap | last week's price | 49.35 | 49.48 |
| 2021-05-27 | toilet_soap | weekly % change | 0.26 | 0.00 |
| 2021-06-10 | petrol | price a year ago | 75.39 | 75.35 |
| 2021-06-10 | petrol | yearly % change | 45.39 | 45.47 |
| 2021-09-16 | wheat_flour | last week's price | 1164.22 | 1222.07 |
| 2021-09-16 | wheat_flour | weekly % change | 6.01 | 0.99 |
| 2021-09-16 | rice_basmati | last week's price | 95.24 | 95.29 |
| 2021-09-16 | rice_basmati | weekly % change | 0.42 | 0.37 |
| 2021-09-16 | rice_irri | last week's price | 72.69 | 72.26 |
| 2021-09-16 | rice_irri | weekly % change | -1.64 | -1.05 |
| 2021-09-16 | beef | last week's price | 547.87 | 553.97 |
| 2021-09-16 | beef | weekly % change | 1.15 | 0.04 |
| 2021-09-16 | mutton | last week's price | 1123.74 | 1125.30 |
| 2021-09-16 | mutton | weekly % change | 0.17 | 0.03 |
| 2021-09-16 | chicken | last week's price | 199.20 | 214.47 |
| 2021-09-16 | chicken | weekly % change | 11.33 | 3.40 |
| 2021-09-16 | milk | last week's price | 111.67 | 111.78 |
| 2021-09-16 | milk | weekly % change | 0.10 | 0.00 |
| 2021-09-16 | curd | last week's price | 129.51 | 129.57 |
| 2021-09-16 | curd | weekly % change | 0.10 | 0.05 |
| 2021-09-16 | powdered_milk | last week's price | 493.30 | 494.17 |
| 2021-09-16 | powdered_milk | weekly % change | 0.54 | 0.36 |
| 2021-09-16 | eggs | last week's price | 164.36 | 170.65 |
| 2021-09-16 | eggs | weekly % change | 7.05 | 3.10 |
| 2021-09-16 | mustard_oil | last week's price | 312.20 | 313.52 |
| 2021-09-16 | mustard_oil | weekly % change | 1.08 | 0.66 |
| 2021-09-16 | cooking_oil | last week's price | 1693.32 | 1713.96 |
| 2021-09-16 | cooking_oil | weekly % change | 2.67 | 1.43 |
| 2021-09-16 | ghee_tin | last week's price | 857.11 | 862.34 |
| 2021-09-16 | ghee_tin | weekly % change | 1.54 | 0.92 |
| 2021-09-16 | ghee | last week's price | 338.21 | 342.66 |
| 2021-09-16 | ghee | weekly % change | 2.04 | 0.71 |
| 2021-09-16 | bananas | last week's price | 81.78 | 79.25 |
| 2021-09-16 | bananas | weekly % change | -7.86 | -4.92 |
| 2021-09-16 | pulse_masoor | last week's price | 179.10 | 182.75 |
| 2021-09-16 | pulse_masoor | weekly % change | 2.00 | -0.03 |
| 2021-09-16 | pulse_moong | last week's price | 180.83 | 180.04 |
| 2021-09-16 | pulse_moong | weekly % change | -2.67 | -2.24 |
| 2021-09-16 | pulse_mash | last week's price | 251.22 | 253.00 |
| 2021-09-16 | pulse_mash | weekly % change | -0.14 | -0.85 |
| 2021-09-16 | pulse_gram | last week's price | 151.98 | 152.11 |
| 2021-09-16 | pulse_gram | weekly % change | -1.12 | -1.20 |
| 2021-09-16 | potatoes | last week's price | 50.63 | 51.31 |
| 2021-09-16 | potatoes | weekly % change | -2.61 | -3.90 |
| 2021-09-16 | onions | last week's price | 51.06 | 62.98 |
| 2021-09-16 | onions | weekly % change | 14.43 | -7.22 |
| 2021-09-16 | tomatoes | last week's price | 55.73 | 67.09 |
| 2021-09-16 | tomatoes | weekly % change | -1.99 | -18.59 |
| 2021-09-16 | sugar | last week's price | 107.41 | 107.11 |
| 2021-09-16 | sugar | weekly % change | 0.95 | 1.23 |
| 2021-09-16 | gur | last week's price | 139.08 | 139.72 |
| 2021-09-16 | gur | weekly % change | 1.01 | 0.55 |
| 2021-09-16 | garlic | last week's price | 270.98 | 274.61 |
| 2021-09-16 | garlic | weekly % change | -0.21 | -1.53 |
| 2021-09-16 | cooked_beef | last week's price | 160.18 | 160.85 |
| 2021-09-16 | cooked_beef | weekly % change | 0.42 | 0.00 |
| 2021-09-16 | tea_cup | last week's price | 30.19 | 30.36 |
| 2021-09-16 | tea_cup | weekly % change | 0.56 | 0.00 |
| 2021-09-16 | washing_soap | last week's price | 59.74 | 60.51 |
| 2021-09-16 | washing_soap | weekly % change | 3.75 | 2.43 |
| 2021-09-16 | lpg | last week's price | 1919.27 | 1869.57 |
| 2021-09-16 | lpg | weekly % change | -0.07 | 2.58 |
| 2022-02-03 | rice_basmati | price a year ago | 89.87 | 89.53 |
| 2022-02-03 | rice_basmati | yearly % change | 12.95 | 13.38 |
| 2022-02-03 | rice_irri | price a year ago | 70.66 | 70.63 |
| 2022-02-03 | rice_irri | yearly % change | 6.17 | 6.22 |
| 2022-02-03 | beef | price a year ago | 474.98 | 474.40 |
| 2022-02-03 | beef | yearly % change | 24.47 | 24.62 |
| 2022-02-03 | mutton | price a year ago | 996.29 | 995.67 |
| 2022-02-03 | mutton | yearly % change | 20.42 | 20.49 |
| 2022-02-03 | chicken | price a year ago | 213.55 | 207.25 |
| 2022-02-03 | chicken | yearly % change | -4.76 | -1.86 |
| 2022-02-03 | powdered_milk | price a year ago | 481.37 | 480.49 |
| 2022-02-03 | powdered_milk | yearly % change | 5.22 | 5.41 |
| 2022-02-03 | eggs | price a year ago | 140.00 | 141.84 |
| 2022-02-03 | eggs | yearly % change | 18.11 | 16.58 |
| 2022-02-03 | mustard_oil | price a year ago | 266.11 | 264.62 |
| 2022-02-03 | mustard_oil | yearly % change | 48.78 | 49.61 |
| 2022-02-03 | cooking_oil | price a year ago | 1468.00 | 1432.22 |
| 2022-02-03 | cooking_oil | yearly % change | 42.72 | 46.29 |
| 2022-02-03 | ghee_tin | price a year ago | 728.96 | 722.29 |
| 2022-02-03 | ghee_tin | yearly % change | 39.71 | 41.00 |
| 2022-02-03 | ghee | price a year ago | 288.13 | 284.00 |
| 2022-02-03 | ghee | yearly % change | 39.29 | 41.31 |
| 2022-02-03 | bananas | price a year ago | 78.66 | 77.01 |
| 2022-02-03 | bananas | yearly % change | 9.10 | 11.44 |
| 2022-02-03 | pulse_masoor | price a year ago | 155.21 | 154.65 |
| 2022-02-03 | pulse_masoor | yearly % change | 38.50 | 39.00 |
| 2022-02-03 | pulse_moong | price a year ago | 232.45 | 231.96 |
| 2022-02-03 | pulse_moong | yearly % change | -26.71 | -26.55 |
| 2022-02-03 | pulse_mash | price a year ago | 251.69 | 251.94 |
| 2022-02-03 | pulse_mash | yearly % change | 8.20 | 8.10 |
| 2022-02-03 | pulse_gram | price a year ago | 143.76 | 142.19 |
| 2022-02-03 | pulse_gram | yearly % change | 15.66 | 16.94 |
| 2022-02-03 | potatoes | price a year ago | 38.95 | 39.01 |
| 2022-02-03 | potatoes | yearly % change | -2.46 | -2.61 |
| 2022-02-03 | onions | price a year ago | 38.83 | 39.82 |
| 2022-02-03 | onions | yearly % change | -3.17 | -5.58 |
| 2022-02-03 | tomatoes | price a year ago | 40.25 | 44.95 |
| 2022-02-03 | tomatoes | yearly % change | 271.80 | 232.93 |
| 2022-02-03 | sugar | price a year ago | 90.22 | 90.30 |
| 2022-02-03 | sugar | yearly % change | 0.21 | 0.12 |
| 2022-02-03 | gur | price a year ago | 128.94 | 128.51 |
| 2022-02-03 | gur | yearly % change | 8.06 | 8.42 |
| 2022-02-03 | chilli_powder | price a year ago | 360.06 | 335.10 |
| 2022-02-03 | chilli_powder | yearly % change | -27.82 | -22.44 |
| 2022-02-03 | garlic | price a year ago | 245.39 | 244.34 |
| 2022-02-03 | garlic | yearly % change | 35.10 | 35.68 |
| 2022-02-03 | cooked_beef | price a year ago | 152.07 | 151.02 |
| 2022-02-03 | cooked_beef | yearly % change | 11.91 | 12.69 |
| 2022-02-03 | cooked_daal | price a year ago | 76.91 | 75.76 |
| 2022-02-03 | cooked_daal | yearly % change | 8.80 | 10.45 |
| 2022-02-03 | shirting | price a year ago | 236.41 | 234.64 |
| 2022-02-03 | shirting | yearly % change | 12.66 | 13.51 |
| 2022-02-03 | georgette | price a year ago | 166.69 | 166.06 |
| 2022-02-03 | georgette | yearly % change | 9.69 | 10.11 |
| 2022-02-03 | firewood | price a year ago | 743.25 | 742.89 |
| 2022-02-03 | firewood | yearly % change | 11.25 | 11.30 |
| 2022-02-03 | energy_saver | price a year ago | 202.04 | 201.43 |
| 2022-02-03 | energy_saver | yearly % change | 4.46 | 4.78 |
| 2022-02-03 | washing_soap | price a year ago | 55.98 | 55.10 |
| 2022-02-03 | washing_soap | yearly % change | 39.51 | 41.74 |
| 2022-02-03 | matchbox | price a year ago | 3.30 | 3.21 |
| 2022-02-03 | matchbox | yearly % change | 10.91 | 14.02 |
| 2022-02-03 | petrol | price a year ago | 112.90 | 110.16 |
| 2022-02-03 | petrol | yearly % change | 31.59 | 34.87 |
| 2022-02-03 | diesel | price a year ago | 117.09 | 114.16 |
| 2022-02-03 | diesel | yearly % change | 24.16 | 27.35 |
| 2022-02-03 | lpg | price a year ago | 1567.86 | 1531.89 |
| 2022-02-03 | lpg | yearly % change | 50.70 | 54.24 |
| 2022-02-03 | toilet_soap | price a year ago | 47.06 | 46.82 |
| 2022-02-03 | toilet_soap | yearly % change | 15.07 | 15.66 |
| 2022-02-17 | long_cloth | price a year ago | 366.83 | 366.28 |
| 2022-02-17 | long_cloth | yearly % change | 7.94 | 8.11 |
| 2022-05-12 | wheat_flour | last week's price | 1073.50 | 966.56 |
| 2022-05-12 | wheat_flour | weekly % change | 27.66 | 41.78 |
| 2022-05-12 | rice_basmati | last week's price | 104.11 | 104.31 |
| 2022-05-12 | rice_basmati | weekly % change | 0.85 | 0.65 |
| 2022-05-12 | rice_irri | last week's price | 76.78 | 77.61 |
| 2022-05-12 | rice_irri | weekly % change | 1.97 | 0.88 |
| 2022-05-12 | beef | last week's price | 624.07 | 624.11 |
| 2022-05-12 | mutton | last week's price | 1289.77 | 1293.57 |
| 2022-05-12 | mutton | weekly % change | 1.94 | 1.64 |
| 2022-05-12 | chicken | last week's price | 273.62 | 279.16 |
| 2022-05-12 | chicken | weekly % change | 14.40 | 12.13 |
| 2022-05-12 | milk | last week's price | 117.98 | 118.66 |
| 2022-05-12 | milk | weekly % change | 0.58 | 0.00 |
| 2022-05-12 | curd | last week's price | 135.90 | 136.36 |
| 2022-05-12 | curd | weekly % change | 0.51 | 0.17 |
| 2022-05-12 | eggs | last week's price | 135.87 | 140.85 |
| 2022-05-12 | eggs | weekly % change | 8.94 | 5.08 |
| 2022-05-12 | mustard_oil | last week's price | 445.97 | 449.09 |
| 2022-05-12 | mustard_oil | weekly % change | 2.68 | 1.97 |
| 2022-05-12 | cooking_oil | last week's price | 2435.32 | 2459.40 |
| 2022-05-12 | cooking_oil | weekly % change | 1.04 | 0.05 |
| 2022-05-12 | ghee_tin | last week's price | 1213.88 | 1227.90 |
| 2022-05-12 | ghee_tin | weekly % change | 1.18 | 0.02 |
| 2022-05-12 | ghee | last week's price | 474.23 | 480.22 |
| 2022-05-12 | ghee | weekly % change | 1.26 | 0.00 |
| 2022-05-12 | bananas | last week's price | 127.24 | 128.19 |
| 2022-05-12 | bananas | weekly % change | -5.16 | -5.87 |
| 2022-05-12 | pulse_masoor | last week's price | 222.03 | 225.27 |
| 2022-05-12 | pulse_masoor | weekly % change | 6.32 | 4.79 |
| 2022-05-12 | pulse_moong | last week's price | 166.47 | 167.80 |
| 2022-05-12 | pulse_moong | weekly % change | 1.77 | 0.97 |
| 2022-05-12 | pulse_mash | last week's price | 272.10 | 272.83 |
| 2022-05-12 | pulse_mash | weekly % change | 2.32 | 2.05 |
| 2022-05-12 | pulse_gram | last week's price | 166.36 | 165.79 |
| 2022-05-12 | pulse_gram | weekly % change | 1.94 | 2.29 |
| 2022-05-12 | potatoes | last week's price | 34.85 | 34.95 |
| 2022-05-12 | potatoes | weekly % change | 7.35 | 7.04 |
| 2022-05-12 | onions | last week's price | 62.85 | 71.09 |
| 2022-05-12 | onions | weekly % change | 18.47 | 4.74 |
| 2022-05-12 | tomatoes | last week's price | 56.40 | 80.57 |
| 2022-05-12 | tomatoes | weekly % change | 25.69 | -12.01 |
| 2022-05-12 | sugar | last week's price | 85.69 | 84.80 |
| 2022-05-12 | sugar | weekly % change | -1.19 | -0.15 |
| 2022-05-12 | gur | last week's price | 131.35 | 129.68 |
| 2022-05-12 | gur | weekly % change | -1.04 | 0.23 |
| 2022-05-12 | garlic | last week's price | 311.07 | 312.12 |
| 2022-05-12 | garlic | weekly % change | 0.68 | 0.34 |
| 2022-05-12 | cooked_beef | last week's price | 177.76 | 177.80 |
| 2022-05-12 | cooked_beef | weekly % change | 0.60 | 0.57 |
| 2022-05-12 | cooked_daal | last week's price | 88.17 | 89.21 |
| 2022-05-12 | cooked_daal | weekly % change | 1.18 | 0.00 |
| 2022-05-12 | cigarettes | last week's price | 88.03 | 89.82 |
| 2022-05-12 | cigarettes | weekly % change | 4.70 | 2.62 |
| 2022-05-12 | lpg | last week's price | 2440.01 | 2461.34 |
| 2022-05-12 | lpg | weekly % change | 0.76 | -0.11 |
| 2022-05-12 | toilet_soap | last week's price | 56.67 | 57.84 |
| 2022-05-12 | toilet_soap | weekly % change | 2.96 | 0.88 |
| 2022-07-14 | ghee | price a year ago | 321.86 | 321.82 |
| 2022-07-14 | ghee | yearly % change | 78.89 | 78.92 |
| 2022-11-17 | firewood | last week's price | 936.42 | 929.42 |
| 2022-11-17 | firewood | weekly % change | 5.44 | 6.23 |
| 2023-11-08 | firewood | price a year ago | 936.42 | 929.42 |
| 2023-11-08 | firewood | yearly % change | 18.11 | 19.00 |
| 2024-06-20 | wheat_flour | last week's price | 1769.18 | 1769.26 |
| 2024-07-11 | wheat_flour | last week's price | 1781.99 | 1970.43 |
| 2024-07-11 | wheat_flour | weekly % change | 8.53 | -1.85 |
| 2024-07-11 | rice_basmati | last week's price | 205.14 | 206.52 |
| 2024-07-11 | rice_basmati | weekly % change | 0.79 | 0.12 |
| 2024-07-11 | rice_irri | last week's price | 159.98 | 161.08 |
| 2024-07-11 | rice_irri | weekly % change | 0.95 | 0.26 |
| 2024-07-11 | bread | last week's price | 110.75 | 110.73 |
| 2024-07-11 | bread | weekly % change | 0.05 | 0.06 |
| 2024-07-11 | beef | last week's price | 956.52 | 958.90 |
| 2024-07-11 | beef | weekly % change | 0.90 | 0.65 |
| 2024-07-11 | mutton | last week's price | 1899.61 | 1901.14 |
| 2024-07-11 | mutton | weekly % change | 0.08 | 0.00 |
| 2024-07-11 | chicken | last week's price | 313.31 | 320.84 |
| 2024-07-11 | chicken | weekly % change | 19.13 | 16.34 |
| 2024-07-11 | curd | last week's price | 223.39 | 224.65 |
| 2024-07-11 | curd | weekly % change | 1.50 | 0.93 |
| 2024-07-11 | powdered_milk | last week's price | 852.26 | 928.07 |
| 2024-07-11 | powdered_milk | weekly % change | 15.50 | 6.07 |
| 2024-07-11 | eggs | last week's price | 249.49 | 247.52 |
| 2024-07-11 | eggs | weekly % change | -1.39 | -0.61 |
| 2024-07-11 | mustard_oil | last week's price | 493.89 | 495.49 |
| 2024-07-11 | mustard_oil | weekly % change | 0.32 | 0.00 |
| 2024-07-11 | cooking_oil | last week's price | 2664.14 | 2670.29 |
| 2024-07-11 | cooking_oil | weekly % change | 0.23 | 0.00 |
| 2024-07-11 | ghee_tin | last week's price | 1295.29 | 1296.93 |
| 2024-07-11 | ghee_tin | weekly % change | 0.34 | 0.22 |
| 2024-07-11 | ghee | last week's price | 504.37 | 505.49 |
| 2024-07-11 | ghee | weekly % change | 0.22 | 0.00 |
| 2024-07-11 | bananas | last week's price | 165.69 | 164.69 |
| 2024-07-11 | bananas | weekly % change | -2.89 | -2.30 |
| 2024-07-11 | pulse_masoor | last week's price | 318.99 | 322.50 |
| 2024-07-11 | pulse_masoor | weekly % change | 2.34 | 1.23 |
| 2024-07-11 | pulse_moong | last week's price | 324.34 | 333.63 |
| 2024-07-11 | pulse_moong | weekly % change | 3.91 | 1.02 |
| 2024-07-11 | pulse_mash | last week's price | 566.86 | 570.56 |
| 2024-07-11 | pulse_mash | weekly % change | 1.13 | 0.47 |
| 2024-07-11 | pulse_gram | last week's price | 309.98 | 318.87 |
| 2024-07-11 | pulse_gram | weekly % change | 6.43 | 3.47 |
| 2024-07-11 | potatoes | last week's price | 98.87 | 97.84 |
| 2024-07-11 | potatoes | weekly % change | -1.89 | -0.86 |
| 2024-07-11 | onions | last week's price | 126.89 | 115.41 |
| 2024-07-11 | onions | weekly % change | -10.46 | -1.55 |
| 2024-07-11 | tomatoes | last week's price | 119.18 | 203.52 |
| 2024-07-11 | tomatoes | weekly % change | 37.52 | -19.47 |
| 2024-07-11 | sugar | last week's price | 143.38 | 144.72 |
| 2024-07-11 | sugar | weekly % change | 1.74 | 0.80 |
| 2024-07-11 | salt | last week's price | 70.26 | 70.29 |
| 2024-07-11 | salt | weekly % change | 0.04 | 0.00 |
| 2024-07-11 | chilli_powder | last week's price | 332.85 | 333.24 |
| 2024-07-11 | chilli_powder | weekly % change | 0.12 | 0.00 |
| 2024-07-11 | garlic | last week's price | 464.95 | 472.13 |
| 2024-07-11 | garlic | weekly % change | 1.93 | 0.38 |
| 2024-07-11 | cooked_daal | last week's price | 152.47 | 152.49 |
| 2024-07-11 | cooked_daal | weekly % change | 0.01 | 0.00 |
| 2024-07-11 | tea_cup | last week's price | 59.57 | 59.78 |
| 2024-07-11 | tea_cup | weekly % change | 0.74 | 0.38 |
| 2024-07-11 | cigarettes | last week's price | 230.16 | 231.73 |
| 2024-07-11 | cigarettes | weekly % change | 0.77 | 0.09 |
| 2024-07-11 | shirting | last week's price | 464.24 | 464.86 |
| 2024-07-11 | shirting | weekly % change | 0.13 | 0.00 |
| 2024-07-11 | georgette | last week's price | 280.05 | 280.61 |
| 2024-07-11 | georgette | weekly % change | 0.56 | 0.36 |
| 2024-07-11 | petrol | last week's price | 259.25 | 266.72 |
| 2024-07-11 | petrol | weekly % change | 2.88 | 0.00 |
| 2024-07-11 | diesel | last week's price | 268.92 | 278.54 |
| 2024-07-11 | diesel | weekly % change | 3.58 | 0.00 |
| 2024-07-11 | lpg | last week's price | 3026.77 | 3076.10 |
| 2024-07-11 | lpg | weekly % change | 1.70 | 0.07 |
| 2024-07-18 | cooking_oil | last week's price | 2670.29 | 2669.05 |
| 2024-07-18 | cooking_oil | weekly % change | 0.13 | 0.18 |
| 2025-06-12 | wheat_flour | last week's price | 1514.32 | 1520.57 |
| 2025-06-12 | wheat_flour | weekly % change | 0.36 | -0.05 |
| 2025-06-12 | wheat_flour | price a year ago | 1769.18 | 1769.26 |
| 2025-06-12 | rice_basmati | last week's price | 200.22 | 202.27 |
| 2025-06-12 | rice_basmati | weekly % change | 1.27 | 0.25 |
| 2025-06-12 | rice_irri | last week's price | 152.60 | 152.80 |
| 2025-06-12 | rice_irri | weekly % change | 0.13 | 0.00 |
| 2025-06-12 | chicken | last week's price | 426.74 | 378.87 |
| 2025-06-12 | chicken | weekly % change | -21.27 | -11.32 |
| 2025-06-12 | milk | last week's price | 198.74 | 199.67 |
| 2025-06-12 | milk | weekly % change | 0.54 | 0.07 |
| 2025-06-12 | eggs | last week's price | 318.98 | 323.27 |
| 2025-06-12 | eggs | weekly % change | 2.03 | 0.67 |
| 2025-06-12 | mustard_oil | last week's price | 526.78 | 527.06 |
| 2025-06-12 | mustard_oil | weekly % change | 0.13 | 0.08 |
| 2025-06-12 | cooking_oil | last week's price | 2896.65 | 2895.98 |
| 2025-06-12 | cooking_oil | weekly % change | -0.23 | -0.20 |
| 2025-06-12 | ghee_tin | last week's price | 1468.82 | 1467.35 |
| 2025-06-12 | ghee_tin | weekly % change | -0.30 | -0.20 |
| 2025-06-12 | ghee | last week's price | 568.06 | 566.70 |
| 2025-06-12 | ghee | weekly % change | -0.04 | 0.20 |
| 2025-06-12 | bananas | last week's price | 178.36 | 181.16 |
| 2025-06-12 | bananas | weekly % change | 3.85 | 2.25 |
| 2025-06-12 | pulse_masoor | last week's price | 293.77 | 295.69 |
| 2025-06-12 | pulse_masoor | weekly % change | 0.22 | -0.43 |
| 2025-06-12 | pulse_moong | last week's price | 402.63 | 403.47 |
| 2025-06-12 | pulse_moong | weekly % change | 0.36 | 0.15 |
| 2025-06-12 | pulse_mash | last week's price | 459.28 | 461.38 |
| 2025-06-12 | pulse_mash | weekly % change | -0.69 | -1.14 |
| 2025-06-12 | pulse_gram | last week's price | 316.34 | 317.72 |
| 2025-06-12 | pulse_gram | weekly % change | 0.22 | -0.21 |
| 2025-06-12 | potatoes | last week's price | 63.62 | 70.95 |
| 2025-06-12 | potatoes | weekly % change | 21.68 | 9.11 |
| 2025-06-12 | onions | last week's price | 44.68 | 47.01 |
| 2025-06-12 | onions | weekly % change | 8.62 | 3.23 |
| 2025-06-12 | tomatoes | last week's price | 52.96 | 61.93 |
| 2025-06-12 | tomatoes | weekly % change | 40.01 | 19.73 |
| 2025-06-12 | sugar | last week's price | 174.67 | 176.84 |
| 2025-06-12 | sugar | weekly % change | 1.43 | 0.18 |
| 2025-06-12 | gur | last week's price | 223.29 | 225.10 |
| 2025-06-12 | gur | weekly % change | 1.33 | 0.52 |
| 2025-06-12 | garlic | last week's price | 358.87 | 345.57 |
| 2025-06-12 | garlic | weekly % change | -9.19 | -5.69 |
| 2025-06-12 | shirting | last week's price | 497.93 | 498.69 |
| 2025-06-12 | shirting | weekly % change | 0.15 | 0.00 |
| 2025-06-12 | petrol | last week's price | 253.79 | 254.82 |
| 2025-06-12 | petrol | weekly % change | 0.41 | 0.00 |
| 2025-06-12 | lpg | last week's price | 3069.43 | 3045.96 |
| 2025-06-12 | lpg | weekly % change | -0.79 | -0.02 |
| 2025-06-26 | wheat_flour | last week's price | 1519.75 | 1520.37 |
| 2025-06-26 | wheat_flour | weekly % change | -0.97 | -1.01 |
| 2025-06-26 | rice_basmati | last week's price | 202.77 | 204.48 |
| 2025-06-26 | rice_basmati | weekly % change | 0.76 | -0.08 |
| 2025-06-26 | rice_irri | last week's price | 152.80 | 152.90 |
| 2025-06-26 | rice_irri | weekly % change | 0.75 | 0.69 |
| 2025-06-26 | beef | last week's price | 1106.88 | 1107.04 |
| 2025-06-26 | beef | weekly % change | 0.01 | 0.00 |
| 2025-06-26 | mutton | last week's price | 2034.13 | 2034.47 |
| 2025-06-26 | mutton | weekly % change | 0.02 | 0.00 |
| 2025-06-26 | chicken | last week's price | 335.97 | 343.25 |
| 2025-06-26 | chicken | weekly % change | -8.82 | -10.75 |
| 2025-06-26 | powdered_milk | last week's price | 1062.99 | 1073.26 |
| 2025-06-26 | powdered_milk | weekly % change | 1.00 | 0.03 |
| 2025-06-26 | eggs | last week's price | 325.44 | 294.42 |
| 2025-06-26 | eggs | weekly % change | -20.63 | -12.27 |
| 2025-06-26 | mustard_oil | last week's price | 527.48 | 533.39 |
| 2025-06-26 | mustard_oil | weekly % change | 1.11 | -0.01 |
| 2025-06-26 | cooking_oil | last week's price | 2890.11 | 2889.13 |
| 2025-06-26 | cooking_oil | weekly % change | -0.19 | -0.15 |
| 2025-06-26 | ghee_tin | last week's price | 1464.43 | 1461.99 |
| 2025-06-26 | ghee_tin | weekly % change | -0.17 | 0.00 |
| 2025-06-26 | ghee | last week's price | 567.83 | 567.89 |
| 2025-06-26 | pulse_masoor | last week's price | 294.41 | 294.99 |
| 2025-06-26 | pulse_masoor | weekly % change | 0.09 | -0.11 |
| 2025-06-26 | pulse_moong | last week's price | 404.07 | 405.11 |
| 2025-06-26 | pulse_moong | weekly % change | -0.13 | -0.39 |
| 2025-06-26 | pulse_mash | last week's price | 456.13 | 457.17 |
| 2025-06-26 | pulse_mash | weekly % change | -0.27 | -0.49 |
| 2025-06-26 | pulse_gram | last week's price | 317.04 | 315.94 |
| 2025-06-26 | pulse_gram | weekly % change | -0.55 | -0.21 |
| 2025-06-26 | potatoes | last week's price | 77.41 | 80.31 |
| 2025-06-26 | potatoes | weekly % change | 2.43 | -1.27 |
| 2025-06-26 | onions | last week's price | 48.53 | 48.57 |
| 2025-06-26 | onions | weekly % change | -1.38 | -1.46 |
| 2025-06-26 | tomatoes | last week's price | 74.15 | 69.98 |
| 2025-06-26 | tomatoes | weekly % change | -4.69 | 0.99 |
| 2025-06-26 | sugar | last week's price | 177.16 | 181.01 |
| 2025-06-26 | sugar | weekly % change | 3.07 | 0.88 |
| 2025-06-26 | gur | last week's price | 226.26 | 231.34 |
| 2025-06-26 | gur | weekly % change | 3.27 | 1.00 |
| 2025-06-26 | garlic | last week's price | 325.89 | 322.52 |
| 2025-06-26 | garlic | weekly % change | 4.06 | 5.15 |
| 2025-06-26 | cooked_daal | last week's price | 164.47 | 165.59 |
| 2025-06-26 | cooked_daal | weekly % change | 0.68 | 0.00 |
| 2025-06-26 | tea_cup | last week's price | 61.14 | 61.38 |
| 2025-06-26 | tea_cup | weekly % change | 0.39 | 0.00 |
| 2025-06-26 | lawn | last week's price | 656.27 | 656.43 |
| 2025-06-26 | lawn | weekly % change | 0.02 | 0.00 |
| 2025-06-26 | firewood | last week's price | 1316.32 | 1316.13 |
| 2025-06-26 | firewood | weekly % change | 0.10 | 0.11 |
| 2025-06-26 | energy_saver | last week's price | 382.86 | 383.87 |
| 2025-06-26 | energy_saver | weekly % change | 0.26 | 0.00 |
| 2025-06-26 | petrol | last week's price | 254.82 | 259.61 |
| 2025-06-26 | petrol | weekly % change | 1.88 | 0.00 |
| 2025-06-26 | diesel | last week's price | 255.80 | 263.74 |
| 2025-06-26 | diesel | weekly % change | 3.10 | 0.00 |
| 2025-06-26 | lpg | last week's price | 3045.20 | 3497.67 |
| 2025-06-26 | lpg | weekly % change | 16.29 | 1.24 |
| 2025-07-10 | cooking_oil | price a year ago | 2670.29 | 2669.05 |
| 2025-07-10 | cooking_oil | yearly % change | 7.81 | 7.86 |
| 2025-08-07 | wheat_flour | last week's price | 1483.11 | 1474.42 |
| 2025-08-07 | wheat_flour | weekly % change | -0.83 | -0.24 |
| 2025-08-07 | rice_irri | last week's price | 154.41 | 154.22 |
| 2025-08-07 | rice_irri | weekly % change | -0.12 | 0.00 |
| 2025-08-07 | beef | last week's price | 1112.08 | 1113.24 |
| 2025-08-07 | beef | weekly % change | 0.10 | 0.00 |
| 2025-08-07 | mutton | last week's price | 2046.01 | 2048.77 |
| 2025-08-07 | mutton | weekly % change | 0.13 | 0.00 |
| 2025-08-07 | chicken | last week's price | 423.39 | 403.25 |
| 2025-08-07 | chicken | weekly % change | -0.83 | 4.12 |
| 2025-08-07 | powdered_milk | last week's price | 1083.45 | 1088.75 |
| 2025-08-07 | powdered_milk | weekly % change | 0.49 | 0.00 |
| 2025-08-07 | eggs | last week's price | 284.64 | 289.75 |
| 2025-08-07 | eggs | weekly % change | 3.14 | 1.32 |
| 2025-08-07 | bananas | last week's price | 167.64 | 162.66 |
| 2025-08-07 | bananas | weekly % change | -4.48 | -1.56 |
| 2025-08-07 | pulse_masoor | last week's price | 296.50 | 295.80 |
| 2025-08-07 | pulse_masoor | weekly % change | 0.11 | 0.34 |
| 2025-08-07 | pulse_moong | last week's price | 397.77 | 391.62 |
| 2025-08-07 | pulse_moong | weekly % change | -2.62 | -1.09 |
| 2025-08-07 | pulse_mash | last week's price | 455.96 | 453.16 |
| 2025-08-07 | pulse_mash | weekly % change | -1.68 | -1.07 |
| 2025-08-07 | pulse_gram | last week's price | 312.85 | 311.05 |
| 2025-08-07 | pulse_gram | weekly % change | -0.67 | -0.10 |
| 2025-08-07 | potatoes | last week's price | 84.09 | 83.48 |
| 2025-08-07 | potatoes | weekly % change | -1.17 | -0.44 |
| 2025-08-07 | onions | weekly % change | 16.55 | 16.53 |
| 2025-08-07 | tomatoes | last week's price | 99.27 | 82.14 |
| 2025-08-07 | tomatoes | weekly % change | -8.84 | 10.17 |
| 2025-08-07 | sugar | last week's price | 180.04 | 179.33 |
| 2025-08-07 | sugar | weekly % change | -0.76 | -0.37 |
| 2025-08-07 | gur | last week's price | 239.21 | 239.31 |
| 2025-08-07 | gur | weekly % change | 0.02 | -0.03 |
| 2025-08-07 | garlic | last week's price | 377.25 | 378.17 |
| 2025-08-07 | garlic | weekly % change | -0.12 | -0.36 |
| 2025-08-07 | cooked_beef | last week's price | 307.63 | 310.95 |
| 2025-08-07 | cooked_beef | weekly % change | 1.08 | 0.00 |
| 2025-08-07 | cigarettes | last week's price | 242.42 | 242.73 |
| 2025-08-07 | cigarettes | weekly % change | 0.25 | 0.12 |
| 2025-08-07 | firewood | last week's price | 1324.06 | 1338.82 |
| 2025-08-07 | firewood | weekly % change | 1.20 | 0.08 |
| 2025-08-07 | energy_saver | last week's price | 385.64 | 386.60 |
| 2025-08-07 | energy_saver | weekly % change | 0.25 | 0.00 |
| 2025-08-07 | lpg | last week's price | 3060.74 | 3018.29 |
| 2025-08-07 | lpg | weekly % change | -4.56 | -3.21 |
| 2025-11-27 | electricity | last week's price | 4.83 | 5.40 |
| 2025-11-27 | electricity | weekly % change | 24.22 | 11.11 |

Generated by `python -m mehngai.verify`.

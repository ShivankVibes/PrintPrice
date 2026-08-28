# PrintPrice 
## Journal17/8/2026 - Built the full calculator
### Total Time
### 2h 55m
I made PrintPrice, which is a calculator for finding the real cost of a 3D print.

I wanted to make it because only checking the filament price leaves out electricity, printer wear, failed prints and the time spent preparing everything. I also wanted it to give a suggested selling price instead of only showing the production cost.

I started by making the HTML structure. I split the calculator into three parts: information about the print, printer and material costs, and the final results.

For the print information, I added filament weight, print hours, minutes and quantity. I then added spool price, spool weight, printer wattage, electricity price, printer price and expected lifetime. I also included labour time, hourly rate, failed print allowance and profit markup.

After finishing the HTML, I started the CSS. I used a light cream background, orange accent colour and a dark blue results panel. I made a small logo and a layered shape using only CSS because I wanted it to look related to 3D printing without needing any images.

The calculator had a lot of inputs, so the first layout looked crowded. Some labels, inputs and units were sitting too close together. I fixed this by putting every input inside a bordered box and placing the units on the right side. I also grouped the inputs into material, printer and power, and time and risk.

I made the main calculator use a grid, with the inputs on the left and the results on the right. The results section shows the suggested price, production cost, estimated profit and a breakdown of every cost. I also added coloured bars to show how much each part adds to the total.

I added media queries so the results move underneath the inputs on smaller screens. The input grids also change to one or two columns so they do not become too narrow.

After the design was mostly finished, I started the JavaScript. I made it calculate filament, electricity, machine wear, labour and failed print costs. These are added together before the profit markup is applied.

I added event listeners to every input so the results update immediately without needing a calculate button. I also formatted the results as euro prices.

The biggest problem I had was that every result stayed at €0.00. At first I thought one of the formulas was wrong, but the real problem was that the JavaScript expected a profit markup input and I had accidentally left it out of the HTML.

Because it could not find that input, the JavaScript stopped before running the calculations. I added the missing input and the calculator started working properly.

I then added local storage so the save button remembers the current settings. I also added a reset button that clears the saved settings and returns everything to the defaults.

Finally, I tested different weights, print times, quantities and profit markups. I checked that the totals updated, the cost bars changed, saved settings stayed after refreshing and the reset button worked.

The default settings give a suggested price of €7.88, with a production cost of €6.06 and an estimated profit of €1.82.I am happy with how it turned out, especially since I made the whole project in one go. It is simple, but it solves an actual problem and does not need an account, database or any setup.

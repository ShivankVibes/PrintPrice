# PrintPrice

PrintPrice is a simple calculator for finding the real cost of a 3D print.

Instead of only checking how much filament a print uses, it also includes electricity, printer wear, labour and failed prints. It then adds a profit markup to give a suggested selling price.

This makes it easier to price prints without guessing or making a spreadsheet for every model.

<img width="2483" height="1347" alt="image" src="https://github.com/user-attachments/assets/85018d3c-9ce2-4b4e-bb1c-78eac293fd92" />


## Live Demo

[Try PrintPrice](https://printpricecalc.netlify.app)

## Features

* Live cost calculation
* Updates as soon as an input is changed
* Filament cost using the spool price and weight
* Electricity cost using printer wattage and print time
* Machine wear based on printer price and expected lifetime
* Labour cost using hands-on time and an hourly rate
* Failed print allowance
* Custom profit markup
* Support for multiple print quantities
* Suggested selling price per print
* Full production cost
* Estimated profit
* Visual cost breakdown
* Saves printer settings on the device
* Reset button for returning to the default settings
* Responsive design for phones and computers
* No account or database needed

## What can be entered

The calculator has settings for:

* Filament used in grams
* Print time in hours and minutes
* Number of prints
* Filament spool price
* Filament spool weight
* Average printer power usage
* Electricity price per kWh
* Printer price
* Expected printer lifetime
* Hands-on labour time
* Hourly labour rate
* Failed print allowance
* Profit markup

Most of the print information can be found in the slicer after slicing a model. The other settings can be saved so they do not need to be entered every time.

## How it works

The calculator first works out how much each part of the print costs.


Filament = grams used × price per gram

Electricity = print hours × printer power in kW × electricity price

Machine wear = print hours × printer price ÷ expected printer lifetime

Labour = hands-on hours × hourly rate


The filament, electricity, machine wear and labour are added together to get the base production cost.

The failed print allowance is then added to cover wasted filament, electricity and time from prints that fail.


Failure allowance = base production cost × failure percentage


After that, the chosen profit markup is added to give the suggested selling price.

Selling price = production cost × profit markup

If more than one print is selected, all of the costs are multiplied by the quantity. It still shows the price for each individual print as well as the total price.

## Cost breakdown

The results section shows:

* Suggested selling price
* Price per print
* Full production cost
* Estimated profit
* Filament cost
* Electricity cost
* Machine wear
* Labour cost
* Failed print allowance
* Total print time per item

Each cost also has a coloured bar showing how much it adds to the total production cost.

For example, the default settings give a suggested selling price of €7.88. The production cost is €6.06 and the estimated profit is €1.82.

## Saving settings

The save button stores the current printer and cost settings using local storage.

This means the settings stay saved in the same browser, but nothing is uploaded anywhere. There is no account, database or personal information needed.

The reset button deletes the saved settings and returns everything to the default values.

## Running it locally

Download or clone the project and open the folder in VS Code.

The project contains:

```
index.html
styles.css
script.js
```

You can open `index.html` directly in a browser, but I normally use the Live Preview or Live Server extension in VS Code.

No packages, installation or build command are needed.

## Project files

### `index.html`

Contains the layout, calculator inputs, results section and page content.

### `styles.css`

Contains the colours, spacing, calculator layout, input styling, cost breakdown and responsive design.

### `script.js`

Reads the values from the inputs, calculates each cost, updates the results and handles saving and resetting the settings.

## Built with

* HTML
* CSS
* JavaScript
* Browser local storage

I kept it as plain HTML, CSS and JavaScript so it is quick to load and easy to run anywhere.

## Why I made it

I wanted a quick way to check what a 3D print actually costs.

Only checking the filament price leaves out electricity, printer wear, failed prints and the time spent preparing everything. These costs might look small on one print, but they can add up if I am making multiple prints or selling them.

I also did not want to make a spreadsheet every time I sliced a new model. With PrintPrice, I can enter the information from the slicer and immediately get a suggested price.

## Problems I had

One problem was getting the page layout right. The calculator has a lot of inputs, so it was easy for everything to look crowded. I fixed this by separating the inputs into print information, material, printer and power, and time and risk.

I also had a problem where every result stayed at €0.00. The JavaScript expected a profit markup input, but I had accidentally left it out of the HTML. This stopped the rest of the JavaScript from running. After adding the missing input, the calculator started working properly.

## Possible future improvements

* Add other currencies
* Add different filament materials
* Export a quote as a PDF
* Save multiple printer profiles
* Add maintenance costs
* Add packaging and delivery costs
* Import print time and filament usage from a slicer file
* Add a dark mode

## Credits

* Original base code and concept by [anadskman](https://github.com/anadskman)
* Enhanced with 3D mesh quoting, WhatsApp integration, and CSV database by PrintPrice.

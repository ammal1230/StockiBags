//connecter a base de donnees
const mongoose = require("mongoose")


mongoose.connect("mongodb://127.0.0.1/stock_bagages")
//apres connecter
.then(()=>{
        console.log("Connected to the database successfully");
    }
)
.catch(
   (err) => {console.log(err);}
)

module.exports=mongoose;
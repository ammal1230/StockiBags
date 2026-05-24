//connecter a base de donnees
const mongoose = require("mongoose")


mongoose.connect(process.env.MONGO_URL)
//apres connecter
.then(()=>{
        console.log("Connected to the database successfully");
    }
)
.catch(
   (err) => {console.log(err);}
)

module.exports=mongoose;
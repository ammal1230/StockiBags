const mongoose= require("mongoose");


const User = mongoose.model("User",{
    name:{
        type:String, required: true
    },
    lastname:{
        type:String, required: true
    },
    dtn:{
        type:String, required: true
    },
    tel:{
        type:String, required: true
    },
    cin:{
        type:String, required: true,unique: true
    },
    email:{
        type:String, required: true
    },
    password:{
        type:String, required: true
    },
    ville:{ type: String, default: null },
})

module.exports=User;
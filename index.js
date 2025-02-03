import express from 'express';
import pg from 'pg';
import axios from 'axios';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import methodOverride from 'method-override';
import ExpressError from './ExpressError.js';
import bcrypt from "bcrypt";
import session from 'express-session';
import passport from 'passport';
import { Strategy } from 'passport-local';
import env from "dotenv";


// const session = await import('express-session').then(mod => mod.default);
// const flash = await import('connect-flash').then(mod => mod.default);

const app = express();
const port = 3000;
const saltRounds=10;
env.config();

// Set up the directory paths correctly for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve static files from the "public" folder
// app.use(express.static("public"));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));


// Use Express built-in body parser middleware
app.use(express.urlencoded({ extended: true })); 
app.use(express.json()); // If handling JSON requests

// Set the view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));



app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { 
        expires : Date.now()+7*24*60*60*1000,
        maxAge : 7*24*60*60*1000,
        httpOnly :true
     }
}));

app.use(passport.initialize());
app.use(passport.session());
// app.use(flash());

// app.use((req,res,next)=>{
//     res.locals.success=req.flash("success");
//     console.log("Session ID:", req.sessionID);
//     console.log('Flash message in middleware:', res.locals.success);
//     next();
// })




const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PORT,
});
db.connect();

let got_readerId;

const comes_first = (req, res, next) => {
    if (req.isAuthenticated()) {
        req.session.userId = req.user.rows[0].reader_id;  // Store user data globally for this request
        console.log("check data here ! ");
        console.log(req.readerId);
        
        return next();  // Continue to the next middleware or route handler
    }
    res.redirect("/notes/login");  // Redirect if not authenticated
};



// Async function to fetch data from the database
async function get_dataAll() {
    try {
        const result = await db.query(`
            SELECT 
                email, 
                name, 
                title, 
                isbn_number, 
                author, 
                content 
            FROM reader
            JOIN book ON reader.reader_id = book.reader_id
            JOIN notes ON book.book_id = notes.book_id
        `);
        return result.rows; // Return the rows from the query
    } catch (error) {
        console.error('Error fetching data: ', error);
        return []; // Return an empty array in case of error
    }
}

let reader_id=1;






app.get("/",(req,res)=>{
    res.render("home.ejs");
})

// Define the route for the homepage
app.get("/notes", async (req, res) => {
    const user_id=req.session.userId;
    try {

        const book_data = await db.query("SELECT * FROM book ORDER BY book_id ASC" ); // Wait for the data to be fetched
        let imp_data=book_data.rows;    
        // console.log(imp_data);
        res.render("index", { imp_data,user_id });   
    } catch (error) {
        throw new ExpressError(500 , "check route should be /notes");
        
    }
    
   // Render the index.ejs template with the data
});


// my dashboard individuala data 

app.get("/notes/individuals",comes_first, async (req, res) => {
    const user_id=req.session.userId;
    console.log("see id ! ");
    console.log(user_id);
    try {

        const book_data = await db.query("SELECT * FROM book where reader_id= $1 ",[user_id] ); // Wait for the data to be fetched
        let imp_data=book_data.rows;    
        console.log(imp_data);
        res.render("myindex.ejs", { imp_data,user_id });   
       } catch (error) {
        throw new ExpressError(500 , "check route should be /notes");
        
    }
    
   // Render the index.ejs template with the data
});


// see all favorite notes 
app.get("/notes/favourite",async(req,res,next)=>{
    try {
        const favorite_notes=await db.query("select notes.content from notes join  favourite  on notes.notes_id=favourite.notes_id ");
        const send_material=favorite_notes.rows;
        console.log(send_material);
        res.render("favorite.ejs",{data_f : send_material});

        
    } catch (error) {
        
        next(error);
     }
       
});



app.get("/notes/new",comes_first,(req,res)=>{
    res.render("new.ejs");
});

// Create a post request 
app.post("/notes/newbookandnote",comes_first, async(req, res,next) => {
    let {title,isbn,author,content}=req.body;
    const user_id=req.session.userId;
    console.log(user_id);
    try {
        const save_data = await db.query(
            "INSERT INTO book (title,reader_id, isbn_number,author) VALUES ($1, $2, $3,$4) RETURNING *",
            [title,user_id, isbn, author]
        );
         console.log(save_data.rows[0]);
         const book_id = save_data.rows[0].book_id;
        
        const save_note=await db.query("INSERT INTO notes(content,reader_id,book_id) VALUES ($1 ,$2,$3)",[content,user_id,book_id]); 
         
        res.redirect("/notes/individuals");     
    } catch (error) {
        next(error);

 }
    
 
    
});

app.get("/notes/:id/viewAll",comes_first,async(req,res,next)=>{
    // let book_id=req.params.id;
    
      const user_id=req.session.userId;
    //   above is the login readerid
    
        
    try {
        
        let book_id=req.params.id;
    
        const received= await db.query("select content ,reader_id, notes_id , book_id from notes where book_id=($1)",[book_id]);
        let content=received.rows;
       
        res.render("notes.ejs",{content : content, length : content.length , book_id : book_id,user_id});
        
       } catch (error) {
              next(error);
       } 

    }
    
   
)


// make note favorite 
app.post("/notes/:id/favourite",async(req,res,next)=>{
   

   try {

    let id=req.params.id;

    if(!id){
        throw new ExpressError(400,"something wrong with id of route /notes/id/favoriteall");
    }
    const get_note=  await db.query("select book_id from notes where notes_id=$1",[id]);
    const needed=get_note.rows[0];
    let book_id=needed.book_id;
  
     await  db.query("insert into favourite (notes_id,book_id) values ($1,$2)",[id,book_id]);
     res.redirect(`/notes/${book_id}/viewAll`);
    
   } catch (error) {
    next(error);
    
   }

})


// book record delete
app.delete("/notes/:id/delete",comes_first,async(req,res,next)=>{
    
    try {

        let id=req.params.id;
        await db.query("DELETE FROM book where book_id=$1",[id]);
        res.redirect("/notes/individuals");
        
    } catch (error) {
        next(error);
    }
    

})

// for editing
app.get("/notes/:id/edit",comes_first,async(req,res,next)=>{

    try {
        let id=req.params.id;
       const book_details=await db.query("select * from book where  book_id=$1",[id]);
       const data=book_details.rows[0];
        res.render("editbook.ejs",{book : data,id});

        
    } catch (error) {
        next(error);
    }
    
})

// edit book record 
app.put("/notes/:id/editbook",comes_first,async(req,res,next)=>{
    
    try {
        let id=req.params.id;
        let{title,isbn,author}=req.body;
        db.query("UPDATE book SET  title=$1,isbn_number=$2,author=$3 where book_id=$4",[title,isbn,author,id]);
       
        res.redirect("/notes/individuals");
    } catch (error) {
        next(error);
    }
   
})

// add a new note 

app.post("/notes/:id/newnote",comes_first,async (req,res,next)=>{

    try {

        let book_id =req.params.id;
        if(!book_id){
            throw new ExpressError(400,"book id is missing");
        }
        let content=req.body.content;
    
        await db.query("INSERT INTO NOTES (content,reader_id,book_id) VALUES ($1,$2,$3)",[content,reader_id,book_id]);
        res.redirect(`/notes/${book_id}/viewAll`);
        
    } catch (error) {
        next(error);
    }
   
})






app.put("/notes/:id/editnote",comes_first,async(req,res)=>{
   
    try {

        let id=req.params.id;
        if(!id){
            throw new ExpressError(400,"id is missing ");
        }
        let content=req.body.content;
    
        const put_one=await db.query("UPDATE notes set content =$1  WHERE notes_id = $2 RETURNING *",[content,id]);
        const get_book_id=put_one.rows[0].book_id;
        res.redirect(`/notes/${get_book_id}/viewAll`);
        
    } catch (error) {
        next(error);
        
    }  

})

// get request for login page 
app.get("/notes/login",(req,res)=>{
    res.render("user/login.ejs");
})

// get for signup

app.get("/notes/signup",(req,res)=>{
    res.render("user/signup.ejs");
})


app.post("/notes/signup/add",async(req,res,next)=>{

    try {

        let{username,Email,password}=req.body;
        const check_login= await db.query("select * from reader where email =$1",[Email]);
        if(check_login.length>0){
            res.redirect("/notes/login");
        }
         

        bcrypt.hash(password, saltRounds, async(err, hash) =>{
            if(err){
                next(err);
            }else{
                await db.query("Insert into reader (email,name,password_hash) values ($1 ,$2, $3)",[Email,username,hash]);
                res.redirect("/notes");
                // Store hash in your password DB.
            }
           
        });
        
        
    } catch (error) {
        next(error)
  }
    

});


app.post("/notes/login/check", passport.authenticate("local",{
    successRedirect:"/notes",
    failureRedirect:"/notes/login"

})
);



// delete one particular note 
app.delete("/notes/:id/delete",comes_first,async(req,res)=>{
    

    try {
        let id=req.params.id;
        let book_id;
        const get_deleted= await db.query("Delete from notes where notes_id=$1 RETURNING *",[id]);
       
       book_id=(get_deleted.rows[0].book_id);
       res.redirect(`/notes/${book_id}/viewAll`);
        
    } catch (error) {
         next(error);
    }
    

})

passport.use(new Strategy( async function verify (username,password,cb){

    try {
        
        const user = await db.query("SELECT * FROM reader WHERE email=$1", [username]);
        
        if (user.rows.length === 0) {
            return cb(null,false ,{message : "email not found!"})
        }

        const stored_data = user.rows[0];
        

        // Compare passwords using bcrypt
        bcrypt.compare(password, stored_data.password_hash, (err, match) => {
            if (err) {
                return cb(err);
            }

            if (match) {
                
                return cb(null,user); // Redirect if password matches
            } else {
                return cb(null,false);
            }
        });

    } catch (error) {
        return cb(error) ;// Forward any errors to the error handler
    }

}));


passport.serializeUser((user,cb)=>{
    cb(null,user);
})


passport.deserializeUser((user,cb)=>{
    cb(null,user);
})






app.use((err, req, res, next) => {
    const { status = 500, message = "An error occurred" } = err;
    console.error(`Error caught: ${message}, Status Code: ${status}`);
    res.status(status).json({ message: message, status: status });  // Send response as JSON
})





// Start the server
app.listen(port, () => {
    console.log(`Server is listening at port ${port}`);
});


// error handling which i used 

// app.use((err, req, res, next) => {
//     let { status = 500, message = "An error occurred" } = err;
//     console.error(`Error caught: ${message}, Status Code: ${status}`);
//     res.status(status).send(message);  // Send response
// });

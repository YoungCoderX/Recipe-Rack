import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, deleteDoc } from 'firebase/firestore';

// Custom Modal Component for user feedback and confirmation
const Modal = ({ message, onClose, onConfirm, showConfirmButtons = false }) => {
    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full text-center">
                <p className="text-lg font-semibold text-gray-800 mb-4">{message}</p>
                {showConfirmButtons ? (
                    <div className="flex justify-center gap-4">
                        <button
                            onClick={onConfirm}
                            className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-300 ease-in-out"
                        >
                            Yes, Delete
                        </button>
                        <button
                            onClick={onClose} // onClose acts as cancel here
                            className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg transition duration-300 ease-in-out"
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={onClose}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-300 ease-in-out"
                    >
                        OK
                    </button>
                )}
            </div>
        </div>
    );
};

// Main App component
const App = () => {
    // State variables for Firebase and user
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // State for recipes
    const [recipes, setRecipes] = useState([]);
    const [newRecipeName, setNewRecipeName] = useState('');
    // FIX: Changed initial state declaration for newRecipeIngredients and newRecipeInstructions
    const [newRecipeIngredients, setNewRecipeIngredients] = useState('');
    const [newRecipeInstructions, setNewRecipeInstructions] = useState('');

    // State for AI recipe generation
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiRecipeLoading, setAiRecipeLoading] = useState(false);
    const [aiGeneratedRecipe, setAiGeneratedRecipe] = useState(null);
    const [aiError, setAiError] = useState('');

    // State to manage the current view/section of the app
    const [currentView, setCurrentView] = useState('home'); // 'home', 'addRecipe', 'generateAi', 'viewRecipes'

    // State for custom modal
    const [showModal, setShowModal] = useState(false);
    const [modalMessage, setModalMessage] = useState('');
    const [modalIsConfirm, setModalIsConfirm] = useState(false); // New state for confirmation modal
    const [modalConfirmAction, setModalConfirmAction] = useState(null); // New state to store action on confirm

    // Function to show custom modal (alert style)
    const showCustomModal = (message) => {
        setModalMessage(message);
        setModalIsConfirm(false);
        setModalConfirmAction(null);
        setShowModal(true);
    };

    // Function to show custom modal (confirm style)
    const showConfirmModal = (message, onConfirmAction) => {
        setModalMessage(message);
        setModalIsConfirm(true);
        setModalConfirmAction(() => onConfirmAction); // Store the function to be called on confirmation
        setShowModal(true);
    };

    // Initialize Firebase and set up authentication listener
    useEffect(() => {
        try {
            // Get Firebase config and app ID from global variables
            const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

            // Initialize Firebase app
            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            const firebaseAuth = getAuth(app);

            setDb(firestoreDb);
            setAuth(firebaseAuth);

            // Listen for authentication state changes
            const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    // Sign in anonymously if no user is logged in
                    try {
                        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                        if (initialAuthToken) {
                            await signInWithCustomToken(firebaseAuth, initialAuthToken);
                        } else {
                            await signInAnonymously(firebaseAuth);
                        }
                    } catch (error) {
                        console.error("Error during anonymous sign-in or custom token sign-in:", error);
                    }
                }
                setIsAuthReady(true);
            });

            return () => unsubscribe(); // Cleanup the listener on component unmount
        } catch (error) {
            console.error("Failed to initialize Firebase:", error);
        }
    }, []);

    // Fetch recipes from Firestore when auth is ready and db is available
    useEffect(() => {
        if (db && isAuthReady && userId) {
            const recipesCollectionRef = collection(db, `artifacts/${__app_id}/users/${userId}/recipes`);
            // Note: orderBy is commented out to avoid potential index issues as per instructions.
            // Data will be sorted in memory if needed.
            const q = query(recipesCollectionRef); // , orderBy('createdAt', 'desc'));

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedRecipes = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                // Sort recipes by createdAt in memory if orderBy is not used in query
                fetchedRecipes.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));
                setRecipes(fetchedRecipes);
            }, (error) => {
                console.error("Error fetching recipes:", error);
            });

            return () => unsubscribe(); // Cleanup the listener
        }
    }, [db, isAuthReady, userId]);

    // Function to add a new recipe
    const addRecipe = async (recipeData) => {
        if (!db || !userId) {
            console.error("Firestore DB or User ID not available.");
            showCustomModal("Firestore DB or User ID not available. Please try again.");
            return;
        }
        try {
            const recipesCollectionRef = collection(db, `artifacts/${__app_id}/users/${userId}/recipes`);
            await addDoc(recipesCollectionRef, {
                ...recipeData,
                createdAt: serverTimestamp() // Add a timestamp
            });
            setNewRecipeName('');
            setNewRecipeIngredients('');
            setNewRecipeInstructions('');
            setAiGeneratedRecipe(null); // Clear AI generated recipe after adding
            showCustomModal("Recipe added successfully!");
            setCurrentView('viewRecipes'); // Navigate to view recipes after adding
        } catch (e) {
            console.error("Error adding document: ", e);
            showCustomModal(`Error adding recipe: ${e.message}`);
        }
    };

    // Function to delete a recipe
    const deleteRecipe = async (id) => {
        showConfirmModal("Are you sure you want to delete this recipe?", async () => {
            // This code runs if the user confirms in the modal
            if (!db || !userId) {
                console.error("Firestore DB or User ID not available.");
                showCustomModal("Firestore DB or User ID not available. Cannot delete recipe.");
                return;
            }
            try {
                const recipeDocRef = doc(db, `artifacts/${__app_id}/users/${userId}/recipes`, id);
                await deleteDoc(recipeDocRef);
                showCustomModal("Recipe deleted successfully!");
            } catch (e) {
                console.error("Error deleting document: ", e);
                showCustomModal(`Error deleting recipe: ${e.message}`);
            }
        });
    };


    // Handle form submission for adding a new recipe
    const handleSubmit = (e) => {
        e.preventDefault();
        if (newRecipeName.trim() && newRecipeIngredients.trim() && newRecipeInstructions.trim()) {
            addRecipe({
                name: newRecipeName,
                ingredients: newRecipeIngredients,
                instructions: newRecipeInstructions
            });
        } else {
            showCustomModal("Please fill in all recipe fields.");
        }
    };

    // Handle adding an AI generated recipe
    const handleAddAiRecipe = () => {
        if (aiGeneratedRecipe) {
            addRecipe({
                name: aiGeneratedRecipe.recipeName,
                ingredients: aiGeneratedRecipe.ingredients.join('\n'), // Join array back to string
                instructions: aiGeneratedRecipe.instructions
            });
        }
    };

    // Function to call LLM for recipe generation
    const generateAiRecipe = async () => {
        if (!aiPrompt.trim()) {
            setAiError("Please enter a prompt for the AI recipe.");
            return;
        }
        setAiRecipeLoading(true);
        setAiGeneratedRecipe(null);
        setAiError('');

        try {
            const chatHistory = [];
            chatHistory.push({ role: "user", parts: [{ text: `Generate a recipe based on the following prompt: "${aiPrompt}". Provide the response as a JSON object with the following structure: { "recipeName": "string", "ingredients": ["string"], "instructions": "string" }. Ensure ingredients is an array of strings, where each string is one ingredient line. Make the instructions very detailed, providing clear, step-by-step guidance.` }] });

            const payload = {
                contents: chatHistory,
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            "recipeName": { "type": "STRING" },
                            "ingredients": {
                                "type": "ARRAY",
                                "items": { "type": "STRING" }
                            },
                            "instructions": { "type": "STRING" }
                        },
                        "propertyOrdering": ["recipeName", "ingredients", "instructions"]
                    }
                }
            };

            // Using the API key provided by the user directly to resolve 403.
            const apiKey = "AIzaSyBFL6cpt43KVe2fF41pGrMPIsV1TmGnJDM"; // Using the new API key provided by the user
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            console.log('Gemini API URL:', apiUrl);
            console.log('API Key (hardcoded based on user input for troubleshooting):', apiKey);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                // Check for 403 specifically, otherwise handle as a generic HTTP error
                if (response.status === 403) {
                    throw new Error(`Authorization error (403): Please ensure your API key has access to the Gemini API.`);
                } else {
                    throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
                }
            }

            const result = await response.json();

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const jsonString = result.candidates[0].content.parts[0].text;
                const parsedJson = JSON.parse(jsonString);
                setAiGeneratedRecipe(parsedJson);

            } else {
                setAiError("Could not generate a recipe. Please try again.");
                console.error("Unexpected API response structure:", result);
            }
        } catch (error) {
            // Log the full error object for better debugging
            console.error("Error calling Gemini API:", error);
            setAiError(`Error generating AI recipe: ${error.message}. This might be a network issue or an invalid API key. Please check your internet connection and API key settings.`);
        } finally {
            setAiRecipeLoading(false);
        }
    };

    if (!isAuthReady) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <p className="text-xl text-gray-700">Loading app...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-100 p-4 font-sans antialiased">
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl p-8 space-y-8">
                <h1 className="text-4xl font-extrabold text-center text-orange-700 mb-8">
                    Recipe Rack
                </h1>

                {/* Removed User ID Display */}

                {currentView === 'home' && (
                    <section className="bg-blue-50 p-6 rounded-xl shadow-inner border border-blue-200 text-center">
                        <h2 className="text-2xl font-bold text-blue-700 mb-4">Your personal cookbook, powered by AI.</h2>
                        <p className="text-gray-700 mb-6">
                            Welcome to Your Digital Cookbook! What would you like to do today?
                        </p>
                        <div className="flex flex-col md:flex-row justify-center gap-4">
                            <button
                                onClick={() => setCurrentView('addRecipe')}
                                className="bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                            >
                                Add New Recipe 📝
                            </button>
                            <button
                                onClick={() => setCurrentView('generateAi')}
                                className="bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                            >
                                Generate AI Recipe ✨
                            </button>
                            <button
                                onClick={() => setCurrentView('viewRecipes')}
                                className="bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                            >
                                View My Recipes 📚
                            </button>
                        </div>
                    </section>
                )}

                {currentView === 'generateAi' && (
                    <section className="bg-orange-50 p-6 rounded-xl shadow-inner border border-orange-200">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold text-orange-600">Generate Recipe with AI ✨</h2>
                            <button
                                onClick={() => setCurrentView('home')}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out"
                            >
                                Back to Home
                            </button>
                        </div>
                        <textarea
                            className="w-full p-3 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-400 focus:border-transparent transition duration-200 resize-y min-h-[80px]"
                            placeholder="e.g., 'A quick dinner recipe with chicken and broccoli' or 'A healthy breakfast smoothie'"
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                        ></textarea>
                        <button
                            onClick={generateAiRecipe}
                            disabled={aiRecipeLoading} // Only disable if recipe text is loading
                            className="mt-4 w-full bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {aiRecipeLoading ? 'Generating Recipe Text...' : 'Generate Recipe'}
                        </button>
                        {aiError && <p className="text-red-500 text-sm mt-2">{aiError}</p>}

                        {aiGeneratedRecipe && (
                            <div className="mt-6 p-5 bg-white rounded-lg shadow-md border border-orange-200">
                                <h3 className={`text-xl font-semibold text-gray-800 mb-3`}>
                                    {aiGeneratedRecipe.recipeName}
                                </h3>
                                <div className="text-gray-700 mb-2">
                                    <span className="font-medium">Ingredients:</span>
                                    <ul className={`list-disc list-inside ml-4`}>
                                        {aiGeneratedRecipe.ingredients.map((ingredient, index) => (
                                            <li key={index}>{ingredient}</li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="text-gray-700 mb-4">
                                    <span className="font-medium">Instructions:</span>
                                    {/* Display detailed instructions, splitting by newlines */}
                                    {aiGeneratedRecipe.instructions.split('\n').filter(step => step.trim() !== '').map((step, index) => (
                                        <p key={index} className="mb-2">{step}</p>
                                    ))}
                                </div>
                                <div className="flex flex-col sm:flex-row gap-3 mt-4">
                                    <button
                                        onClick={handleAddAiRecipe}
                                        className="flex-1 bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                                    >
                                        Add to My Cookbook
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {currentView === 'addRecipe' && (
                    <section className="bg-orange-50 p-6 rounded-xl shadow-inner border border-orange-200">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold text-orange-600">Add Your Own Recipe 📝</h2>
                            <button
                                onClick={() => setCurrentView('home')}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out"
                            >
                                Back to Home
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="recipeName" className="block text-gray-700 text-sm font-medium mb-1">Recipe Name</label>
                                <input
                                    type="text"
                                    id="recipeName"
                                    className="w-full p-3 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-400 focus:border-transparent transition duration-200"
                                    value={newRecipeName}
                                    onChange={(e) => setNewRecipeName(e.target.value)}
                                    placeholder="e.g., Grandma's Apple Pie"
                                />
                            </div>
                            <div>
                                <label htmlFor="ingredients" className="block text-gray-700 text-sm font-medium mb-1">Ingredients (one per line)</label>
                                <textarea
                                    id="ingredients"
                                    className="w-full p-3 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-400 focus:border-transparent transition duration-200 resize-y min-h-[100px]"
                                    value={newRecipeIngredients}
                                    onChange={(e) => setNewRecipeIngredients(e.target.value)}
                                    placeholder="e.g., 2 cups flour&#10;1 cup sugar&#10;3 apples"
                                ></textarea>
                            </div>
                            <div>
                                <label htmlFor="instructions" className="block text-gray-700 text-sm font-medium mb-1">Instructions</label>
                                <textarea
                                    id="instructions"
                                    className="w-full p-3 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-400 focus:border-transparent transition duration-200 resize-y min-h-[150px]"
                                    value={newRecipeInstructions}
                                    onChange={(e) => setNewRecipeInstructions(e.target.value)}
                                    placeholder="e.g., 1. Preheat oven to 375°F.&#10;2. Mix ingredients..."
                                ></textarea>
                            </div>
                            <button
                                type="submit"
                                className="w-full bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                            >
                                Add Recipe
                            </button>
                        </form>
                    </section>
                )}

                {currentView === 'viewRecipes' && (
                    <section className="bg-white p-6 rounded-xl shadow-xl border border-orange-200">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-3xl font-bold text-orange-700 text-center">Your Recipes 📚</h2>
                            <button
                                onClick={() => setCurrentView('home')}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out"
                            >
                                Back to Home
                            </button>
                        </div>
                        {recipes.length === 0 ? (
                            <p className="text-center text-gray-600 text-lg">No recipes yet. Add one above or generate with AI!</p>
                        ) : (
                            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
                                {recipes.map((recipe) => (
                                    <div key={recipe.id} className="bg-orange-50 p-5 rounded-lg shadow-md border border-orange-100 hover:shadow-lg transition duration-300 flex flex-col">
                                        <h3 className="text-xl font-bold text-orange-800 mb-2">{recipe.name}</h3>
                                        <div className="mb-3 flex-grow"> {/* Added flex-grow to push delete button to bottom */}
                                            <p className="font-semibold text-gray-700 mb-1">Ingredients:</p>
                                            <ul className="list-disc list-inside text-gray-600 ml-4">
                                                {recipe.ingredients.split('\n').map((ingredient, index) => (
                                                    ingredient.trim() && <li key={index}>{ingredient.trim()}</li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div className="mb-4">
                                            <p className="font-semibold text-gray-700 mb-1">Instructions:</p>
                                            <p className="text-gray-600 whitespace-pre-wrap">{recipe.instructions}</p>
                                        </div>
                                        <button
                                            onClick={() => deleteRecipe(recipe.id)}
                                            className="mt-auto bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                                        >
                                            Delete Recipe 🗑️
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                )}
            </div>
            {showModal && (
                <Modal
                    message={modalMessage}
                    onClose={() => {
                        setShowModal(false);
                        setModalConfirmAction(null); // Clear action on close
                    }}
                    onConfirm={() => {
                        if (modalConfirmAction) {
                            modalConfirmAction();
                        }
                        setShowModal(false); // Close modal after action
                        setModalConfirmAction(null); // Clear action
                    }}
                    showConfirmButtons={modalIsConfirm}
                />
            )}
        </div>
    );
};

export default App;

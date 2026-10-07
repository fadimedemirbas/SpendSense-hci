# SpendSense Project Overview

## Project Name
SpendSense

## Project Type
Human-Computer Interaction (HCI) Project

## Project Purpose
SpendSense is a decision-support application that helps users evaluate potential purchases before spending money.

Instead of only tracking expenses after they happen, SpendSense focuses on the moment before a purchase decision is made.

The application considers:
- The user's available budget
- Personal financial goals
- Spending behavior
- Purchase motivation

Based on this information, the system provides an explainable purchase evaluation.

## Main Idea
Traditional expense tracking applications answer the question:

"Where did my money go?"

SpendSense aims to answer:

"What will happen if I spend this money?"

The system helps users understand how a purchase may affect their monthly budget and long-term financial goals.

## Core Feature
The main feature of the application is the "Should I Buy It?" flow.

The user enters information about a product, such as:
- Product name
- Price
- Category
- Purchase reason
- Whether they already own a similar product
- How long they have wanted the product

The system then provides:
- Purchase score
- Need level
- Budget compatibility
- Goal impact
- Behavioral risk
- Estimated goal delay

Example:

"This purchase could delay your Barcelona Trip goal by approximately 12 days."

## Project Scope
The first version of SpendSense will include:
- Welcome screen
- Basic onboarding
- Spending behavior questions
- Spending profile result
- Goal creation
- Dashboard
- Purchase input
- Purchase analysis
- Purchase simulation
- History and insights

## Technical Scope
The project does not require a real financial dataset or machine learning model.

The backend will mainly demonstrate:
- Data transfer between frontend and backend
- Rule-based purchase analysis
- Goal delay calculations
- JSON API responses

User and application data can be stored temporarily using frontend state and localStorage.